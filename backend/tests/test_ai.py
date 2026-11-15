"""AI layer: provider adapters, response validation, fallback to the §15 rules."""
from __future__ import annotations

import base64
import json
import unittest
from unittest import mock

from app.domain.scoring import confidence_of, score, verdict_of_scores
from app.services.ai import config, texts as ai_texts
from app.services.ai.base import ImagePart, LlmError, ProviderConfig, TextPart
from app.services.ai.client import complete, complete_json
from tests.fake_llm import FakeLlm

PARAMS = {'material': 'paper', 'desc': '', 'thickness': 0.5, 'o2': 21, 'flow': 5,
          'gravity': 'microgravity', 'temp': 25, 'time': 30}

GOOD_REPLY = json.dumps({
    'summary': 'Needs Attention: paper in an oxygen-rich environment with weak flow '
               'can sustain a flame, but rapid spread is not expected.',
    'why': 'Risk is increased by the highly flammable material, oxygen near the '
           'upper end of the normal range, and microgravity.',
    'why_ext': 'Extinction probability is medium: the material is thin, but the air '
               'flow keeps feeding the flame.',
    'rec_intro': 'Sector LB-1 needs attention. Actions were prepared by the AI module '
                 'and require alignment with onboard protocols.',
    'rec_steps': [
        {'title': 'Reduce the oxygen supply', 'detail': 'Stop sector ventilation.'},
        {'title': 'Confirm report receipt on Earth', 'detail': 'Report the measures taken.'},
    ],
}, ensure_ascii=False)

PNG = base64.b64encode(b'\x89PNG\r\n\x1a\n fake').decode()


class ProviderCase(unittest.TestCase):
    def setUp(self) -> None:
        self.llm = FakeLlm()
        self.addCleanup(self.llm.stop)

    def cfg(self, provider: str, **kw) -> ProviderConfig:
        return ProviderConfig(provider=provider, model='test-model', api_key='k-test',
                              base_url=self.llm.base_url, timeout_s=5, **kw)


class TestAdapters(ProviderCase):
    def test_openai_compatible_text(self):
        self.llm.reply = 'hello'
        out = complete('system', [TextPart('input')], self.cfg('openai_compat'))
        self.assertEqual(out, 'hello')
        req = self.llm.requests[-1]
        self.assertTrue(req['path'].endswith('/chat/completions'))
        self.assertEqual(req['headers']['authorization'], 'Bearer k-test')
        self.assertEqual(req['body']['messages'][0], {'role': 'system', 'content': 'system'})
        # Plain text is sent as a string — simple gateways accept this too.
        self.assertEqual(req['body']['messages'][1]['content'], 'input')

    def test_openai_compatible_image_and_extra(self):
        self.llm.reply = 'ok'
        complete('s', [ImagePart('image/png', PNG), TextPart('what is in the photo')],
                 self.cfg('openai_compat', extra={'temperature': 0.2}))
        body = self.llm.requests[-1]['body']
        self.assertEqual(body['temperature'], 0.2)
        parts = body['messages'][1]['content']
        self.assertEqual(parts[0]['type'], 'image_url')
        self.assertTrue(parts[0]['image_url']['url'].startswith('data:image/png;base64,'))
        self.assertEqual(parts[1], {'type': 'text', 'text': 'what is in the photo'})

    def test_anthropic_shape(self):
        self.llm.reply = 'response'
        out = complete('system', [ImagePart('image/jpeg', PNG), TextPart('input')],
                       self.cfg('anthropic'))
        self.assertEqual(out, 'response')
        req = self.llm.requests[-1]
        self.assertTrue(req['path'].endswith('/v1/messages'))
        self.assertEqual(req['headers']['x-api-key'], 'k-test')
        self.assertEqual(req['headers']['anthropic-version'], '2023-06-01')
        self.assertEqual(req['body']['system'], 'system')
        content = req['body']['messages'][0]['content']
        self.assertEqual(content[0]['source'],
                         {'type': 'base64', 'media_type': 'image/jpeg', 'data': PNG})
        self.assertEqual(content[1], {'type': 'text', 'text': 'input'})

    def test_google_shape_keeps_key_out_of_errors(self):
        self.llm.reply = 'response'
        out = complete('system', [TextPart('input')], self.cfg('google'))
        self.assertEqual(out, 'response')
        req = self.llm.requests[-1]
        self.assertIn(':generateContent', req['path'])
        self.assertEqual(req['body']['systemInstruction']['parts'][0]['text'], 'system')
        self.assertEqual(req['body']['generationConfig']['maxOutputTokens'], 2000)
        # The key is in the query string — check it never appears in the error text.
        self.llm.status = 500
        self.llm.raw = 'boom'
        with self.assertRaises(LlmError) as ctx:
            complete('s', [TextPart('x')], self.cfg('google'))
        self.assertNotIn('k-test', str(ctx.exception))

    def test_http_error_and_empty_reply_raise(self):
        self.llm.status = 429
        self.llm.raw = '{"error":"rate limit"}'
        with self.assertRaises(LlmError):
            complete('s', [TextPart('x')], self.cfg('openai_compat'))
        self.llm.status, self.llm.raw = 200, '{"choices":[{"message":{"content":""}}]}'
        with self.assertRaises(LlmError):
            complete('s', [TextPart('x')], self.cfg('openai_compat'))

    def test_json_parsing_survives_fences_and_prose(self):
        self.llm.reply = 'Here is the result:\n```json\n{"a": 1}\n```\ndone'
        self.assertEqual(complete_json('s', [TextPart('x')], self.cfg('openai_compat')),
                         {'a': 1})
        self.llm.reply = 'not json at all'
        with self.assertRaises(LlmError):
            complete_json('s', [TextPart('x')], self.cfg('openai_compat'))

    def test_unknown_provider(self):
        with self.assertRaises(LlmError):
            complete('s', [TextPart('x')], self.cfg('no-such-provider'))


class TestConfig(unittest.TestCase):
    def test_disabled_without_provider(self):
        with mock.patch.dict('os.environ', {}, clear=True):
            self.assertIsNone(config.load('texts'))
            self.assertIsNone(config.load('vision'))

    def test_feature_override_and_aliases(self):
        env = {'XSCI_AI_PROVIDER': 'openrouter', 'XSCI_AI_MODEL': 'shared/model',
               'XSCI_AI_API_KEY': 'k', 'XSCI_AI_BASE_URL': 'http://x/v1',
               'XSCI_AI_VISION_MODEL': 'custom/vision', 'XSCI_AI_EXTRA_JSON': '{"temperature":0.1}'}
        with mock.patch.dict('os.environ', env, clear=True):
            t, v = config.load('texts'), config.load('vision')
            self.assertEqual((t.provider, t.model), ('openai_compat', 'shared/model'))
            self.assertEqual(v.model, 'custom/vision')
            self.assertEqual(t.extra, {'temperature': 0.1})
            self.assertEqual(t.label(), 'openai_compat:shared/model')
            self.assertEqual(config.describe()['texts'], 'openai_compat:shared/model')

    def test_feature_can_be_switched_off(self):
        env = {'XSCI_AI_PROVIDER': 'openai_compat', 'XSCI_AI_MODEL': 'm',
               'XSCI_AI_TEXTS': '0'}
        with mock.patch.dict('os.environ', env, clear=True):
            self.assertIsNone(config.load('texts'))
            self.assertIsNotNone(config.load('vision'))

    def test_broken_extra_json_is_ignored(self):
        env = {'XSCI_AI_PROVIDER': 'openai_compat', 'XSCI_AI_MODEL': 'm',
               'XSCI_AI_EXTRA_JSON': '{not json'}
        with mock.patch.dict('os.environ', env, clear=True):
            self.assertEqual(config.load('texts').extra, {})


class TestTextGeneration(ProviderCase):
    def env(self) -> dict[str, str]:
        return {'XSCI_AI_PROVIDER': 'openai_compat', 'XSCI_AI_MODEL': 'test-model',
                'XSCI_AI_API_KEY': 'k', 'XSCI_AI_BASE_URL': self.llm.base_url,
                'XSCI_AI_TIMEOUT_S': '5'}

    def generate(self):
        s = score(PARAMS)
        return ai_texts.generate(PARAMS, s, 'l1', verdict_of_scores(s),
                                 confidence_of(PARAMS))

    def test_llm_texts_used_when_valid(self):
        self.llm.reply = GOOD_REPLY
        with mock.patch.dict('os.environ', self.env(), clear=True):
            out, source, version = self.generate()
        self.assertEqual(source, 'llm')
        self.assertEqual(version, 'openai_compat:test-model')
        self.assertIn('Needs Attention', out['summary'])
        # Step numbering is server-assigned.
        self.assertEqual([s['n'] for s in out['rec_steps']], ['01', '02'])

    def test_facts_given_to_model_contain_scores_not_asked_back(self):
        self.llm.reply = GOOD_REPLY
        with mock.patch.dict('os.environ', self.env(), clear=True):
            self.generate()
        sent = self.llm.requests[-1]['body']['messages'][1]['content']
        self.assertIn('RiskScore: 9 of 16', sent)
        self.assertIn('Verdict: Needs Attention', sent)
        self.assertIn('microgravity', sent)

    def test_fallback_on_unavailable_provider(self):
        self.llm.status, self.llm.raw = 500, 'boom'
        with mock.patch.dict('os.environ', self.env(), clear=True):
            out, source, version = self.generate()
        self.assertEqual((source, version), ('rules', 'rules-v0.1'))
        self.assertEqual(out['summary'], ai_texts.rules_texts(
            PARAMS, score(PARAMS), 'l1', 'medium')['summary'])

    def test_fallback_on_invalid_shape(self):
        for bad in ('{"summary":"short"}',
                    json.dumps({**json.loads(GOOD_REPLY), 'rec_steps': []}),
                    json.dumps({**json.loads(GOOD_REPLY), 'why': 123}),
                    json.dumps({**json.loads(GOOD_REPLY), 'summary': 'too short'}),
                    json.dumps({**json.loads(GOOD_REPLY),
                                'rec_steps': [{'title': 'present', 'detail': ''}] * 2}),
                    json.dumps({**json.loads(GOOD_REPLY),
                                'rec_steps': [{'title': 'step', 'detail': 'd'}] * 12})):
            with self.subTest(bad=bad[:40]):
                self.llm.reply = bad
                with mock.patch.dict('os.environ', self.env(), clear=True):
                    _out, source, _v = self.generate()
                self.assertEqual(source, 'rules')

    def test_rules_used_when_ai_not_configured(self):
        with mock.patch.dict('os.environ', {}, clear=True):
            _out, source, version = self.generate()
        self.assertEqual((source, version), ('rules', 'rules-v0.1'))
        self.assertEqual(self.llm.requests, [])

    def test_validate_accepts_good_reply(self):
        out = ai_texts.validate(json.loads(GOOD_REPLY))
        self.assertEqual(len(out['rec_steps']), 2)
        self.assertNotIn('\n', out['summary'])


class TestAnalysisUsesAi(ProviderCase):
    """POST /api/analyses: the model's texts flow into the record and the report."""

    def setUp(self) -> None:
        super().setUp()
        from tests.test_api import ApiCase, INPUT_A

        self.api = ApiCase('run')
        self.api.setUp()
        self.addCleanup(self.api.tearDown)
        self.api.sign_in()
        self.input_a = INPUT_A

    def env(self) -> dict[str, str]:
        return {'XSCI_AI_PROVIDER': 'openai_compat', 'XSCI_AI_MODEL': 'test-model',
                'XSCI_AI_API_KEY': 'k', 'XSCI_AI_BASE_URL': self.llm.base_url,
                'XSCI_AI_TIMEOUT_S': '5'}

    def test_record_and_report_carry_llm_texts(self):
        self.llm.reply = GOOD_REPLY
        with mock.patch.dict('os.environ', self.env(), clear=True):
            body = self.api.create(self.input_a).get_json()
        a = body['analysis']
        self.assertEqual(a['texts_source'], 'llm')
        self.assertEqual(a['texts_model'], 'openai_compat:test-model')
        self.assertIn('Needs Attention', a['texts']['summary'])
        # The scores and verdict still come from the §14 rules — the model does not affect them.
        self.assertEqual((a['risk'], a['ext'], a['v'], a['conf']), (9, 2, 'medium', 62))
        doc = self.api.client.get('/api/reports/RPT-0001').get_json()['content']
        self.assertIn('Needs Attention', doc['sections'][0]['t'])
        self.assertEqual(len(doc['steps']), 2)
        # §11.2 — "Limitations" names the model that wrote the texts.
        self.assertIn('AI model (openai_compat:test-model)', doc['sections'][3]['t'])

    def test_record_marks_rules_when_model_fails(self):
        self.llm.status, self.llm.raw = 500, 'boom'
        with mock.patch.dict('os.environ', self.env(), clear=True):
            a = self.api.create(self.input_a).get_json()['analysis']
        self.assertEqual(a['texts_source'], 'rules')
        self.assertEqual(a['texts_model'], 'rules-v0.1')
        self.assertTrue(a['texts']['summary'])


class TestOutputCleanup(unittest.TestCase):
    """Formatting of the model's response is fixed silently — a substantive response is not discarded."""

    def test_strips_markup_numbering_and_quotes(self):
        reply = {**json.loads(GOOD_REPLY), 'rec_steps': [
            {'title': '**1. Reduce the oxygen supply**', 'detail': '`Stop the ventilation.`'},
            {'title': 'Step 2: shut off the line', 'detail': '«Remove power from the rack.»'},
        ]}
        out = ai_texts.validate(reply)
        self.assertEqual([s['title'] for s in out['rec_steps']],
                         ['Reduce the oxygen supply', 'shut off the line'])
        self.assertEqual(out['rec_steps'][0]['detail'], 'Stop the ventilation.')
        self.assertEqual(out['rec_steps'][1]['detail'], 'Remove power from the rack.')
        # Numbering is set by the server, not the model.
        self.assertEqual([s['n'] for s in out['rec_steps']], ['01', '02'])

    def test_long_values_are_trimmed_not_rejected(self):
        long_title = 'Reduce the oxygen supply in the sector ' * 8
        reply = {**json.loads(GOOD_REPLY),
                 'summary': 'The flame is sustained. ' * 80,
                 'rec_steps': [{'title': long_title, 'detail': 'Details.'},
                               {'title': 'Confirm receipt', 'detail': 'Report it.'}]}
        out = ai_texts.validate(reply)
        self.assertLessEqual(len(out['summary']), ai_texts.LIMITS['summary'][1] + 1)
        self.assertLessEqual(len(out['rec_steps'][0]['title']), ai_texts.TITLE_MAX + 1)
        self.assertTrue(out['rec_steps'][0]['title'].endswith('…'))

    def test_accepts_up_to_ten_steps(self):
        reply = {**json.loads(GOOD_REPLY),
                 'rec_steps': [{'title': f'Step {i}', 'detail': 'Step details.'}
                               for i in range(1, 11)]}
        self.assertEqual(len(ai_texts.validate(reply)['rec_steps']), 10)

    def test_newlines_collapse(self):
        reply = {**json.loads(GOOD_REPLY)}
        reply['summary'] = 'First line.\n\nSecond line also matters to the operator.'
        out = ai_texts.validate(reply)
        self.assertNotIn('\n', out['summary'])
