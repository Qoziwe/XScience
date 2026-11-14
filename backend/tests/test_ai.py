"""ИИ-слой: адаптеры провайдеров, валидация ответа, фолбэк на правила §15."""
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
    'summary': 'Требует внимания: бумага в кислородной среде при слабом потоке '
               'может поддерживать пламя, но быстрое распространение не ожидается.',
    'why': 'Риск повышают легковоспламеняемый материал, кислород на верхней '
           'границе нормы и микрогравитация.',
    'why_ext': 'Затухание средней вероятности: тонкий материал, но поток пламя питает.',
    'rec_intro': 'Сектор ЛБ-1 требует внимания. Действия подготовлены ИИ-модулем '
                 'и требуют согласования с бортовыми протоколами.',
    'rec_steps': [
        {'title': 'Снизьте приток кислорода', 'detail': 'Остановите вентиляцию сектора.'},
        {'title': 'Подтвердите приём отчёта на Земле', 'detail': 'Сообщите о мерах.'},
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
        self.llm.reply = 'привет'
        out = complete('система', [TextPart('вход')], self.cfg('openai_compat'))
        self.assertEqual(out, 'привет')
        req = self.llm.requests[-1]
        self.assertTrue(req['path'].endswith('/chat/completions'))
        self.assertEqual(req['headers']['authorization'], 'Bearer k-test')
        self.assertEqual(req['body']['messages'][0], {'role': 'system', 'content': 'система'})
        # Чистый текст уходит строкой — так принимают и простые шлюзы.
        self.assertEqual(req['body']['messages'][1]['content'], 'вход')

    def test_openai_compatible_image_and_extra(self):
        self.llm.reply = 'ок'
        complete('s', [ImagePart('image/png', PNG), TextPart('что на фото')],
                 self.cfg('openai_compat', extra={'temperature': 0.2}))
        body = self.llm.requests[-1]['body']
        self.assertEqual(body['temperature'], 0.2)
        parts = body['messages'][1]['content']
        self.assertEqual(parts[0]['type'], 'image_url')
        self.assertTrue(parts[0]['image_url']['url'].startswith('data:image/png;base64,'))
        self.assertEqual(parts[1], {'type': 'text', 'text': 'что на фото'})

    def test_anthropic_shape(self):
        self.llm.reply = 'ответ'
        out = complete('система', [ImagePart('image/jpeg', PNG), TextPart('вход')],
                       self.cfg('anthropic'))
        self.assertEqual(out, 'ответ')
        req = self.llm.requests[-1]
        self.assertTrue(req['path'].endswith('/v1/messages'))
        self.assertEqual(req['headers']['x-api-key'], 'k-test')
        self.assertEqual(req['headers']['anthropic-version'], '2023-06-01')
        self.assertEqual(req['body']['system'], 'система')
        content = req['body']['messages'][0]['content']
        self.assertEqual(content[0]['source'],
                         {'type': 'base64', 'media_type': 'image/jpeg', 'data': PNG})
        self.assertEqual(content[1], {'type': 'text', 'text': 'вход'})

    def test_google_shape_keeps_key_out_of_errors(self):
        self.llm.reply = 'ответ'
        out = complete('система', [TextPart('вход')], self.cfg('google'))
        self.assertEqual(out, 'ответ')
        req = self.llm.requests[-1]
        self.assertIn(':generateContent', req['path'])
        self.assertEqual(req['body']['systemInstruction']['parts'][0]['text'], 'система')
        self.assertEqual(req['body']['generationConfig']['maxOutputTokens'], 2000)
        # Ключ в query — проверяем, что в тексте ошибки его не будет.
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
        self.llm.reply = 'Вот результат:\n```json\n{"a": 1}\n```\nготово'
        self.assertEqual(complete_json('s', [TextPart('x')], self.cfg('openai_compat')),
                         {'a': 1})
        self.llm.reply = 'совсем не json'
        with self.assertRaises(LlmError):
            complete_json('s', [TextPart('x')], self.cfg('openai_compat'))

    def test_unknown_provider(self):
        with self.assertRaises(LlmError):
            complete('s', [TextPart('x')], self.cfg('ничего такого'))


class TestConfig(unittest.TestCase):
    def test_disabled_without_provider(self):
        with mock.patch.dict('os.environ', {}, clear=True):
            self.assertIsNone(config.load('texts'))
            self.assertIsNone(config.load('vision'))

    def test_feature_override_and_aliases(self):
        env = {'XSCI_AI_PROVIDER': 'openrouter', 'XSCI_AI_MODEL': 'общая/модель',
               'XSCI_AI_API_KEY': 'k', 'XSCI_AI_BASE_URL': 'http://x/v1',
               'XSCI_AI_VISION_MODEL': 'своя/vision', 'XSCI_AI_EXTRA_JSON': '{"temperature":0.1}'}
        with mock.patch.dict('os.environ', env, clear=True):
            t, v = config.load('texts'), config.load('vision')
            self.assertEqual((t.provider, t.model), ('openai_compat', 'общая/модель'))
            self.assertEqual(v.model, 'своя/vision')
            self.assertEqual(t.extra, {'temperature': 0.1})
            self.assertEqual(t.label(), 'openai_compat:общая/модель')
            self.assertEqual(config.describe()['texts'], 'openai_compat:общая/модель')

    def test_feature_can_be_switched_off(self):
        env = {'XSCI_AI_PROVIDER': 'openai_compat', 'XSCI_AI_MODEL': 'm',
               'XSCI_AI_TEXTS': '0'}
        with mock.patch.dict('os.environ', env, clear=True):
            self.assertIsNone(config.load('texts'))
            self.assertIsNotNone(config.load('vision'))

    def test_broken_extra_json_is_ignored(self):
        env = {'XSCI_AI_PROVIDER': 'openai_compat', 'XSCI_AI_MODEL': 'm',
               'XSCI_AI_EXTRA_JSON': '{не json'}
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
        self.assertIn('Требует внимания', out['summary'])
        # Нумерация шагов серверная.
        self.assertEqual([s['n'] for s in out['rec_steps']], ['01', '02'])

    def test_facts_given_to_model_contain_scores_not_asked_back(self):
        self.llm.reply = GOOD_REPLY
        with mock.patch.dict('os.environ', self.env(), clear=True):
            self.generate()
        sent = self.llm.requests[-1]['body']['messages'][1]['content']
        self.assertIn('RiskScore: 9 из 16', sent)
        self.assertIn('Вердикт: Требует внимания', sent)
        self.assertIn('микрогравитация', sent)

    def test_fallback_on_unavailable_provider(self):
        self.llm.status, self.llm.raw = 500, 'boom'
        with mock.patch.dict('os.environ', self.env(), clear=True):
            out, source, version = self.generate()
        self.assertEqual((source, version), ('rules', 'rules-v0.1'))
        self.assertEqual(out['summary'], ai_texts.rules_texts(
            PARAMS, score(PARAMS), 'l1', 'medium')['summary'])

    def test_fallback_on_invalid_shape(self):
        for bad in ('{"summary":"коротко"}',
                    json.dumps({**json.loads(GOOD_REPLY), 'rec_steps': []}),
                    json.dumps({**json.loads(GOOD_REPLY), 'why': 123}),
                    json.dumps({**json.loads(GOOD_REPLY), 'summary': 'слишком коротко'}),
                    json.dumps({**json.loads(GOOD_REPLY),
                                'rec_steps': [{'title': 'есть', 'detail': ''}] * 2}),
                    json.dumps({**json.loads(GOOD_REPLY),
                                'rec_steps': [{'title': 'шаг', 'detail': 'd'}] * 12})):
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
    """POST /api/analyses: тексты от модели попадают в запись и в отчёт."""

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
        self.assertIn('Требует внимания', a['texts']['summary'])
        # Баллы и вердикт остались от правил §14 — модель на них не влияет.
        self.assertEqual((a['risk'], a['ext'], a['v'], a['conf']), (9, 2, 'medium', 62))
        doc = self.api.client.get('/api/reports/RPT-0001').get_json()['content']
        self.assertIn('Требует внимания', doc['sections'][0]['t'])
        self.assertEqual(len(doc['steps']), 2)
        # §11.2 — «Ограничения» называют модель, написавшую тексты.
        self.assertIn('ИИ-моделью (openai_compat:test-model)', doc['sections'][3]['t'])

    def test_record_marks_rules_when_model_fails(self):
        self.llm.status, self.llm.raw = 500, 'boom'
        with mock.patch.dict('os.environ', self.env(), clear=True):
            a = self.api.create(self.input_a).get_json()['analysis']
        self.assertEqual(a['texts_source'], 'rules')
        self.assertEqual(a['texts_model'], 'rules-v0.1')
        self.assertTrue(a['texts']['summary'])


class TestOutputCleanup(unittest.TestCase):
    """Форматирование ответа модели чиним молча — ответ по делу не отбрасываем."""

    def test_strips_markup_numbering_and_quotes(self):
        reply = {**json.loads(GOOD_REPLY), 'rec_steps': [
            {'title': '**1. Снизьте приток кислорода**', 'detail': '`Остановите вентиляцию.`'},
            {'title': 'Шаг 2: обесточьте линию', 'detail': '«Снимите питание со стойки.»'},
        ]}
        out = ai_texts.validate(reply)
        self.assertEqual([s['title'] for s in out['rec_steps']],
                         ['Снизьте приток кислорода', 'обесточьте линию'])
        self.assertEqual(out['rec_steps'][0]['detail'], 'Остановите вентиляцию.')
        self.assertEqual(out['rec_steps'][1]['detail'], 'Снимите питание со стойки.')
        # Нумерацию ставит сервер, а не модель.
        self.assertEqual([s['n'] for s in out['rec_steps']], ['01', '02'])

    def test_long_values_are_trimmed_not_rejected(self):
        long_title = 'Снизьте приток кислорода в сектор ' * 8
        reply = {**json.loads(GOOD_REPLY),
                 'summary': 'Пламя поддерживается. ' * 80,
                 'rec_steps': [{'title': long_title, 'detail': 'Детали.'},
                               {'title': 'Подтвердите приём', 'detail': 'Сообщите.'}]}
        out = ai_texts.validate(reply)
        self.assertLessEqual(len(out['summary']), ai_texts.LIMITS['summary'][1] + 1)
        self.assertLessEqual(len(out['rec_steps'][0]['title']), ai_texts.TITLE_MAX + 1)
        self.assertTrue(out['rec_steps'][0]['title'].endswith('…'))

    def test_accepts_up_to_ten_steps(self):
        reply = {**json.loads(GOOD_REPLY),
                 'rec_steps': [{'title': f'Шаг {i}', 'detail': 'Детали шага.'}
                               for i in range(1, 11)]}
        self.assertEqual(len(ai_texts.validate(reply)['rec_steps']), 10)

    def test_newlines_collapse(self):
        reply = {**json.loads(GOOD_REPLY)}
        reply['summary'] = 'Первая строка.\n\nВторая строка тоже важна для оператора.'
        out = ai_texts.validate(reply)
        self.assertNotIn('\n', out['summary'])
