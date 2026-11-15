"""§17.3, §18.7 — photo upload, operator annotation, model recognition."""
from __future__ import annotations

import io
import json
import struct
import unittest
import zlib
from unittest import mock

from app.services.ai import vision
from app.services.ai.base import LlmError
from tests.fake_llm import FakeLlm
from tests.test_api import ApiCase, INPUT_A


def png_bytes(width: int = 2, height: int = 2) -> bytes:
    """A minimal valid PNG — so the file-signature check is exercised for real."""
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    raw = b''.join(b'\x00' + b'\xff\x00\x00' * width for _ in range(height))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))


GOOD_VISION = json.dumps({'size': 'medium', 'brightness': 'bright',
                          'shape': 'round', 'note': 'A round, bright flame is in frame.',
                          'flame_visible': True}, ensure_ascii=False)


class PhotoCase(ApiCase):
    def setUp(self) -> None:
        super().setUp()
        import tempfile
        self.photo_dir = tempfile.mkdtemp()
        self.app.config['PHOTO_DIR'] = self.photo_dir

    def tearDown(self) -> None:
        import shutil
        shutil.rmtree(self.photo_dir, ignore_errors=True)
        super().tearDown()

    def upload(self, data: bytes = None, name: str = 'flame.png', **form):
        payload = {'file': (io.BytesIO(data if data is not None else png_bytes()), name),
                   **{k: str(v) for k, v in form.items()}}
        return self.client.post('/api/photos', data=payload,
                                content_type='multipart/form-data')


class TestUpload(PhotoCase):
    def test_upload_and_fetch(self):
        r = self.upload()
        self.assertEqual(r.status_code, 201)
        body = r.get_json()
        self.assertEqual(body['mime'], 'image/png')
        self.assertEqual(body['file_name'], 'flame.png')
        self.assertGreater(body['size_bytes'], 0)
        self.assertIsNone(body['analysis_id'])
        self.assertIsNone(body['recognition'])
        self.assertIn('part of the risk and extinction calculation', body['note'])

        got = self.client.get(f'/api/photos/{body["id"]}')
        self.assertEqual(got.status_code, 200)
        raw = self.client.get(body['file_url'])
        self.assertEqual(raw.status_code, 200)
        self.assertEqual(raw.mimetype, 'image/png')
        raw.close()  # send_file keeps the file open until the response is closed

    def test_rejects_non_image_by_content(self):
        r = self.upload(data=b'%PDF-1.7 not an image', name='doc.png')
        self.assertEqual(r.status_code, 422)
        self.assertIn('file', r.get_json()['fields'])

    def test_rejects_oversize(self):
        self.app.config['PHOTO_MAX_BYTES'] = 10
        r = self.upload()
        self.assertEqual(r.status_code, 422)

    def test_optional_analysis_binding(self):
        self.create(INPUT_A)
        body = self.upload(analysis_id=1).get_json()
        self.assertEqual(body['analysis_id'], 1)
        listed = self.client.get('/api/photos?analysis_id=1').get_json()
        self.assertEqual([p['id'] for p in listed], [body['id']])
        r = self.upload(analysis_id=999)
        self.assertEqual(r.status_code, 422)

    def test_delete_removes_file(self):
        body = self.upload().get_json()
        self.assertEqual(self.client.delete(f'/api/photos/{body["id"]}').status_code, 204)
        self.assertEqual(self.client.get(f'/api/photos/{body["id"]}').status_code, 404)
        self.assertEqual(self.client.get(body['file_url']).status_code, 404)


class TestAnnotation(PhotoCase):
    def test_operator_annotation_vocabulary(self):
        pid = self.upload().get_json()['id']
        r = self.client.patch(f'/api/photos/{pid}',
                              json={'size': 'medium', 'shape': 'elongated'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()['annotation'],
                         {'size': 'medium', 'shape': 'elongated'})
        # Setting an empty value again clears the choice (§17.3).
        r = self.client.patch(f'/api/photos/{pid}', json={'shape': ''})
        self.assertEqual(r.get_json()['annotation'], {'size': 'medium'})
        r = self.client.patch(f'/api/photos/{pid}', json={'brightness': 'blinding'})
        self.assertEqual(r.status_code, 422)


class TestRecognition(PhotoCase):
    def setUp(self) -> None:
        super().setUp()
        self.llm = FakeLlm()
        self.addCleanup(self.llm.stop)

    def env(self) -> dict[str, str]:
        return {'XSCI_AI_VISION_PROVIDER': 'openai_compat',
                'XSCI_AI_VISION_MODEL': 'vision-test',
                'XSCI_AI_VISION_API_KEY': 'k',
                'XSCI_AI_VISION_BASE_URL': self.llm.base_url,
                'XSCI_AI_VISION_TIMEOUT_S': '5'}

    def test_recognize_fills_features_and_keeps_operator_annotation(self):
        pid = self.upload().get_json()['id']
        self.client.patch(f'/api/photos/{pid}', json={'size': 'small'})
        self.llm.reply = GOOD_VISION
        with mock.patch.dict('os.environ', self.env(), clear=True):
            r = self.client.post(f'/api/photos/{pid}/recognize')
        self.assertEqual(r.status_code, 200)
        body = r.get_json()
        self.assertEqual(body['recognition']['size'], 'medium')
        self.assertEqual(body['recognition']['model'], 'openai_compat:vision-test')
        # The operator's annotation is not overwritten by recognition.
        self.assertEqual(body['annotation'], {'size': 'small'})
        # The photo was actually sent to the model as an image.
        parts = self.llm.requests[-1]['body']['messages'][1]['content']
        self.assertEqual(parts[0]['type'], 'image_url')
        self.assertIn('data:image/png;base64,', parts[0]['image_url']['url'])

    def test_409_when_vision_not_configured(self):
        pid = self.upload().get_json()['id']
        with mock.patch.dict('os.environ', {}, clear=True):
            r = self.client.post(f'/api/photos/{pid}/recognize')
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.get_json()['error'], 'vision_not_configured')

    def test_502_when_model_fails(self):
        pid = self.upload().get_json()['id']
        self.llm.status, self.llm.raw = 500, 'boom'
        with mock.patch.dict('os.environ', self.env(), clear=True):
            r = self.client.post(f'/api/photos/{pid}/recognize')
        self.assertEqual(r.status_code, 502)
        self.assertEqual(r.get_json()['error'], 'vision_failed')

    def test_no_flame_clears_features(self):
        pid = self.upload().get_json()['id']
        self.llm.reply = json.dumps({'size': 'large', 'brightness': None,
                                     'shape': None, 'note': 'No flame is visible.',
                                     'flame_visible': False}, ensure_ascii=False)
        with mock.patch.dict('os.environ', self.env(), clear=True):
            body = self.client.post(f'/api/photos/{pid}/recognize').get_json()
        rec = body['recognition']
        self.assertFalse(rec['flame_visible'])
        self.assertIsNone(rec['size'])


class TestVisionValidation(unittest.TestCase):
    def test_rejects_words_outside_vocabulary(self):
        with self.assertRaises(LlmError):
            vision.validate({'size': 'gigantic', 'note': 'x'})
        with self.assertRaises(LlmError):
            vision.validate({'size': 'small', 'note': ''})

    def test_nulls_allowed(self):
        out = vision.validate({'size': None, 'brightness': None, 'shape': None,
                               'note': 'The frame is blurry.', 'flame_visible': False})
        self.assertEqual(out['size'], None)
        self.assertFalse(out['flame_visible'])
