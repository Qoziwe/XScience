"""§17–18.5: dataset, readiness, and training of the ML model, the d² law."""
from __future__ import annotations

import unittest

from app.domain import d2
from app.domain.dataset import all_rows, summary, training_rows
from app.services import ml
from tests.test_api import ApiCase


class TestDatasetDomain(unittest.TestCase):
    def test_v1_matches_spec(self):
        v1 = [r for r in all_rows() if r['dataset'] == 'v1']
        self.assertEqual(len(v1), 30)
        # §19.3 — the only mismatch with the formulas: row 13.
        self.assertEqual([r['n'] for r in v1 if not r['ok']], [13])
        self.assertEqual(sorted({r['risk_level'] for r in v1}), ['high'])
        # §19.1 — simulated_rule_based is not part of the schema.
        self.assertFalse(any(r['data_source_valid'] for r in v1))

    def test_extension_fixes_the_blocking_problems(self):
        info = summary()
        self.assertGreaterEqual(info['rows'], 50)
        self.assertEqual(sorted(info['risk_classes']), ['high', 'low', 'medium'])
        self.assertGreater(info['earth_rows'], 0)
        train = training_rows()
        self.assertTrue(all(r['data_source_valid'] for r in train))
        # Extension labels are computed by the §14 formulas — there can be no mismatches.
        self.assertTrue(all(r['ok'] for r in train))


class TestD2(unittest.TestCase):
    def test_solve(self):
        out = d2.solve(2.0, 0.5)
        self.assertEqual(out['d0_squared_mm2'], 4.0)
        self.assertEqual(out['t_burn_s'], 8.0)
        self.assertEqual(len(out['points']), 41)
        self.assertEqual(out['points'][0]['d2'], 4.0)
        self.assertEqual(out['points'][0]['d'], 1.0)
        self.assertEqual(out['points'][-1]['d2'], 0.0)

    def test_validate_bounds(self):
        errors, _ = d2.validate({'d0_mm': 0.05, 'k_mm2_s': 'abc'})
        self.assertIn('d0_mm', errors)
        self.assertIn('k_mm2_s', errors)
        self.assertEqual(d2.validate({'d0_mm': 1, 'k_mm2_s': 0.5})[0], {})


class TestModelsApi(ApiCase):
    def setUp(self) -> None:
        super().setUp()
        self.sign_in()

    def test_readiness_reports_four_checks(self):
        state = self.client.get('/api/models/ml/readiness').get_json()
        keys = [c['key'] for c in state['checks']]
        self.assertEqual(keys, ['rows', 'risk_classes', 'data_source', 'earth_rows'])
        # The data_source check fails: the 30 v1 rows are outside the §19.1 schema.
        self.assertFalse(next(c for c in state['checks'] if c['key'] == 'data_source')['passed'])
        self.assertEqual(state['mismatches'], 1)
        self.assertFalse(state['model']['trained'])
        self.assertTrue(state['training_set']['can_train'])
        self.assertTrue(state['training_set']['labels_are_rule_derived'])

    def test_predict_before_training_is_409(self):
        r = self.client.post('/api/models/ml/predict', json={
            'material_type': 'paper', 'thickness_mm': 0.5, 'oxygen_percent': 21,
            'air_flow_cm_s': 5, 'gravity': 'microgravity', 'temperature_C': 25,
            'time_s': 30, 'material_description': ''}, headers=self.auth_headers())
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.get_json()['error'], 'model_not_trained')

    def test_train_then_predict(self):
        r = self.client.post('/api/models/ml/train', json={'epochs': 120},
                             headers=self.auth_headers())
        self.assertEqual(r.status_code, 201)
        body = r.get_json()
        self.assertEqual(body['version'], 'logreg-v1')
        for target in ('risk_level', 'extinction_probability'):
            m = body['metrics']['targets'][target]
            self.assertGreater(m['train_accuracy'], 0.5)
            self.assertIn('test_accuracy', m)
        self.assertTrue(body['metrics']['labels_are_rule_derived'])

        state = self.client.get('/api/models/ml/readiness').get_json()
        self.assertTrue(state['model']['trained'])

        r = self.client.post('/api/models/ml/predict', json={
            'material_type': 'paper', 'thickness_mm': 0.1, 'oxygen_percent': 30,
            'air_flow_cm_s': 20, 'gravity': 'microgravity', 'temperature_C': 250,
            'time_s': 300, 'material_description': ''}, headers=self.auth_headers())
        self.assertEqual(r.status_code, 200)
        pred = r.get_json()['predictions']
        self.assertEqual(pred['risk_level']['label'], 'high')
        self.assertAlmostEqual(sum(pred['risk_level']['probabilities'].values()), 1.0,
                               places=3)

    def test_predict_validates_input(self):
        r = self.client.post('/api/models/ml/predict', json={'material_type': 'paper'},
                             headers=self.auth_headers())
        self.assertEqual(r.status_code, 422)
        self.assertIn('oxygen_percent', r.get_json()['fields'])
        self.assertNotIn('sector', r.get_json()['fields'])

    def test_d2_endpoint(self):
        r = self.client.post('/api/models/d2', json={'d0_mm': 2, 'k_mm2_s': 0.5},
                             headers=self.auth_headers())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()['t_burn_s'], 8.0)
        r = self.client.post('/api/models/d2', json={'d0_mm': 99},
                             headers=self.auth_headers())
        self.assertEqual(r.status_code, 422)

    def test_dataset_endpoint(self):
        body = self.client.get('/api/dataset').get_json()
        self.assertGreaterEqual(body['summary']['rows'], 120)
        self.assertEqual(len(body['rows']), body['summary']['rows'])
        only = self.client.get('/api/dataset?only_mismatches=1').get_json()['rows']
        self.assertEqual([r['n'] for r in only], [13])
        v1 = self.client.get('/api/dataset?dataset=v1').get_json()['rows']
        self.assertEqual(len(v1), 30)

    def test_models_require_session(self):
        for path in ('/api/dataset', '/api/models/ml/readiness'):
            self.assertEqual(self.client_without_session().get(path).status_code, 401)

    def client_without_session(self):
        return self.app.test_client()
