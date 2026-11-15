"""Endpoints §18: analyses, sectors, reports, idempotency."""
from __future__ import annotations

import json
import os
import tempfile
import unittest

from app import create_app
from app.services import reports as reports_svc

INPUT_A = {  # §23, example A → verdict medium
    'sector': 'l1', 'material_type': 'paper', 'material_description': '',
    'thickness_mm': 0.5, 'oxygen_percent': 21, 'air_flow_cm_s': 5,
    'gravity': 'microgravity', 'temperature_C': 25, 'time_s': 30,
}
INPUT_C = {  # §23, example C → verdict low, no alert
    'sector': 'zh', 'material_type': 'fabric', 'material_description': '',
    'thickness_mm': 5, 'oxygen_percent': 14, 'air_flow_cm_s': 0,
    'gravity': 'earth', 'temperature_C': 20, 'time_s': 5,
}


class ApiCase(unittest.TestCase):
    def setUp(self) -> None:
        fd, self.db_path = tempfile.mkstemp(suffix='.sqlite3')
        os.close(fd)
        self.app = create_app({
            'DB_PATH': self.db_path,
            'REPORT_WORKER': False,
            'REPORT_SEND_DELAY_S': 0,
        })
        self.client = self.app.test_client()

    def tearDown(self) -> None:
        os.unlink(self.db_path)

    # --- helpers -----------------------------------------------------------
    def create(self, body: dict, **kwargs):
        return self.client.post('/api/analyses', json=body, **kwargs)


class TestAnalyses(ApiCase):
    def test_create_computes_everything_server_side(self):
        r = self.create(INPUT_A)
        self.assertEqual(r.status_code, 201)
        body = r.get_json()
        a = body['analysis']
        self.assertEqual((a['risk'], a['ext'], a['level'], a['extLevel']),
                         (9, 2, 'high', 'medium'))
        self.assertEqual((a['v'], a['conf'], a['danger_index']), ('medium', 62, 9))
        self.assertEqual(body['alert_level'], 'medium')
        self.assertEqual(a['id'], 1)
        self.assertEqual(a['report_id'], 'RPT-0001')
        self.assertEqual(a['sector'], 'l1')
        self.assertEqual(a['model_version'], 'rules-v0.1')
        self.assertTrue(a['texts']['summary'])
        self.assertTrue(a['texts']['rec_steps'])
        self.assertIsNone(a['sent'])
        self.assertEqual(a['p']['thickness'], 0.5)

    def test_client_sent_scores_are_ignored(self):
        """§18.3 — scores and a verdict sent by the client do not affect the record."""
        r = self.create({**INPUT_A, 'risk': 99, 'v': 'low', 'conf': 1,
                         'texts': {'summary': 'fake'}})
        a = r.get_json()['analysis']
        self.assertEqual((a['risk'], a['v'], a['conf']), (9, 'medium', 62))
        self.assertNotEqual(a['texts']['summary'], 'fake')

    def test_low_verdict_has_no_alert(self):
        self.assertIsNone(self.create(INPUT_C).get_json()['alert_level'])

    def test_validation_returns_422_with_fields(self):
        r = self.create({**INPUT_A, 'oxygen_percent': 12.9, 'sector': 'xx'})
        self.assertEqual(r.status_code, 422)
        body = r.get_json()
        self.assertEqual(body['error'], 'validation_failed')
        self.assertIn('oxygen_percent', body['fields'])
        self.assertIn('sector', body['fields'])

    def test_non_numeric_value_is_rejected(self):
        r = self.create({**INPUT_A, 'oxygen_percent': 'abc'})
        self.assertEqual(r.status_code, 422)
        self.assertIn('oxygen_percent', r.get_json()['fields'])

    def test_other_material_requires_description(self):
        r = self.create({**INPUT_A, 'material_type': 'other', 'material_description': '  '})
        self.assertEqual(r.status_code, 422)
        self.assertIn('material_description', r.get_json()['fields'])
        r = self.create({**INPUT_A, 'material_type': 'other', 'material_description': 'resin'})
        self.assertEqual(r.status_code, 201)

    def test_bad_json_is_400(self):
        r = self.client.post('/api/analyses', data='{', content_type='application/json')
        self.assertEqual(r.status_code, 400)

    def test_idempotency_key_prevents_duplicates(self):
        h = {'Idempotency-Key': 'k-1'}
        first = self.create(INPUT_A, headers=h)
        second = self.create(INPUT_A, headers=h)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.get_json()['analysis']['id'],
                         second.get_json()['analysis']['id'])
        self.assertEqual(len(self.client.get('/api/analyses').get_json()), 1)

    def test_idempotency_conflict_on_different_body(self):
        h = {'Idempotency-Key': 'k-2'}
        self.create(INPUT_A, headers=h)
        r = self.create(INPUT_C, headers=h)
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.get_json()['error'], 'idempotency_conflict')

    def test_list_newest_first_and_filters(self):
        self.create(INPUT_A)
        self.create(INPUT_C)
        ids = [a['id'] for a in self.client.get('/api/analyses').get_json()]
        self.assertEqual(ids, [2, 1])
        only = self.client.get('/api/analyses?sector=zh').get_json()
        self.assertEqual([a['id'] for a in only], [2])
        page = self.client.get('/api/analyses?before_id=2').get_json()
        self.assertEqual([a['id'] for a in page], [1])

    def test_get_one_and_404(self):
        self.create(INPUT_A)
        self.assertEqual(self.client.get('/api/analyses/1').status_code, 200)
        self.assertEqual(self.client.get('/api/analyses/99').status_code, 404)

    def test_csv_export(self):
        self.create(INPUT_A)
        r = self.client.get('/api/analyses.csv')
        self.assertEqual(r.status_code, 200)
        lines = r.get_data(as_text=True).lstrip('﻿').strip().split('\n')
        self.assertTrue(lines[0].startswith('id,time,sector,material_type'))
        cells = lines[1].split(',')
        self.assertEqual(cells[2], 'l1')
        self.assertEqual(cells[10], '9')

    def test_ack(self):
        self.create(INPUT_A)
        r = self.client.post('/api/analyses/1/ack')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.get_json()['already'])
        self.assertTrue(self.client.post('/api/analyses/1/ack').get_json()['already'])
        self.assertIsNotNone(self.client.get('/api/analyses/1').get_json()['acked_at'])

    def test_record_is_immutable_after_create(self):
        self.create(INPUT_A)
        before = self.client.get('/api/analyses/1').get_json()
        self.create(INPUT_C)
        after = self.client.get('/api/analyses/1').get_json()
        self.assertEqual(json.dumps(before, sort_keys=True), json.dumps(after, sort_keys=True))


class TestSectorsAndShip(ApiCase):
    def test_sectors_geometry(self):
        secs = self.client.get('/api/sectors').get_json()
        self.assertEqual(len(secs), 7)
        l1 = next(s for s in secs if s['id'] == 'l1')
        self.assertEqual(l1['code'], 'LB-1')
        self.assertEqual(l1['geometry'], {'x': 394, 'y': 40, 'w': 116, 'h': 85})

    def test_ship_status_empty(self):
        st = self.client.get('/api/ship/status').get_json()
        self.assertEqual((st['analysed'], st['total']), (0, 7))
        self.assertIsNone(st['verdict'])
        self.assertEqual(st['counts']['none'], 7)

    def test_ship_status_after_analyses(self):
        self.create(INPUT_A)
        self.create(INPUT_C)
        st = self.client.get('/api/ship/status').get_json()
        self.assertEqual(st['analysed'], 2)
        self.assertEqual(st['worst'], 'medium')
        self.assertEqual(st['counts'], {'high': 0, 'medium': 1, 'low': 1, 'none': 5})
        self.assertEqual(next(s for s in st['sectors'] if s['id'] == 'l1')['status'], 'medium')
        self.assertEqual(next(s for s in st['sectors'] if s['id'] == 'sh')['status'], 'none')

    def test_new_safe_analysis_replaces_sector_status(self):
        """§23 — a new safe analysis in a dangerous sector recolors the sector."""
        self.create({**INPUT_A, 'sector': 'zh', 'oxygen_percent': 28, 'air_flow_cm_s': 20,
                     'temperature_C': 150, 'time_s': 90, 'material_type': 'plastic',
                     'thickness_mm': 0.8})
        st = self.client.get('/api/ship/status').get_json()
        self.assertEqual(st['worst'], 'high')
        self.create(INPUT_C)
        st = self.client.get('/api/ship/status').get_json()
        self.assertEqual(st['worst'], 'low')
        self.assertEqual(st['counts']['high'], 0)


class TestReports(ApiCase):
    def setUp(self) -> None:
        super().setUp()
        self.create(INPUT_A)

    def test_list_and_document(self):
        lst = self.client.get('/api/reports').get_json()
        self.assertEqual(len(lst), 1)
        self.assertEqual(lst[0]['id'], 'RPT-0001')
        self.assertEqual(lst[0]['status'], 'queued')
        doc = self.client.get('/api/reports/RPT-0001').get_json()['content']
        self.assertEqual(doc['no'], 'RPT-0001')
        self.assertEqual(doc['title'], 'LB-1 · Laboratory 1')
        self.assertEqual(doc['verdict'], 'Needs Attention')
        self.assertEqual([m['v'] for m in doc['meta'] if m['k'] == 'Transmission'],
                         ['Queued for transmission'])
        self.assertEqual([s['h'] for s in doc['sections']],
                         ['Conclusion', 'Input Parameters', 'Scores', 'Limitations'])

    def test_txt_export(self):
        txt = self.client.get('/api/reports/RPT-0001.txt').get_data(as_text=True)
        self.assertTrue(txt.startswith('REPORT RPT-0001'))
        self.assertIn('RECOMMENDATIONS', txt)
        self.assertIn('CONCLUSION', txt)

    def test_queue_becomes_sent_and_survives_restart(self):
        """§11.4 — transmission status is stored in the DB, not in the process's timer."""
        self.assertEqual(reports_svc.flush_queue(self.db_path, 0), 1)
        lst = self.client.get('/api/reports').get_json()
        self.assertEqual(lst[0]['status'], 'sent')
        self.assertIsNotNone(lst[0]['sent_at'])
        # A new app instance on the same DB sees the report as sent.
        other = create_app({'DB_PATH': self.db_path, 'REPORT_WORKER': False}).test_client()
        rec = other.get('/api/analyses/1').get_json()
        self.assertIsNotNone(rec['sent'])
        self.assertEqual(rec['report_status'], 'sent')

    def test_since_filter(self):
        later = self.client.get('/api/reports?since=2999-01-01T00:00:00Z').get_json()
        self.assertEqual(later, [])

    def test_404_for_unknown_report(self):
        self.assertEqual(self.client.get('/api/reports/RPT-9999').status_code, 404)


class TestReportConclusion(ApiCase):
    """§11.2 — "Conclusion" and "Limitations" in the report document."""

    def test_verdict_not_duplicated_and_limits_name_text_source(self):
        self.create(INPUT_A)
        doc = self.client.get('/api/reports/RPT-0001').get_json()['content']
        conclusion = doc['sections'][0]['t']
        self.assertTrue(conclusion.startswith('Needs Attention.'))
        self.assertEqual(conclusion.lower().count('needs attention'), 1)
        limits = doc['sections'][3]['t']
        self.assertIn('rules in section 14', limits)
        self.assertIn('ML model forecast is not part of it', limits)

    def test_conclusion_helper_skips_duplicate_prefix(self):
        from app.domain.report import _conclusion
        self.assertEqual(_conclusion('Dangerous', 'Dangerous: the flame is spreading.'),
                         'Dangerous: the flame is spreading.')
        self.assertEqual(_conclusion('Dangerous', 'The flame is spreading.'),
                         'Dangerous. The flame is spreading.')
