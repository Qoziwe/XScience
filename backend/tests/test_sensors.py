"""Sensor simulation: sector adjacency, Markov transitions, API."""
from __future__ import annotations

import os
import tempfile
import unittest

from app import create_app
from app.db import connect, query
from app.domain.format import iso, utc_now
from app.domain.reference import sector_adjacency
from app.domain.scoring import score, verdict_of_scores
from app.services import sensors as svc
from app.services.security import hash_password, new_id, new_totp_secret

LOGIN, PASSWORD, CODE = 'tester', 'test-password', '123456'


class AdjacencyCase(unittest.TestCase):
    def test_geometry_based_pairs(self):
        adj = sector_adjacency()
        expected = {
            'sh': {'km'}, 'km': {'sh', 'zh'}, 'zh': {'km', 'l1', 'l2'},
            'l1': {'zh', 'l2', 'sk'}, 'l2': {'zh', 'l1', 'sk'},
            'sk': {'l1', 'l2', 'ep'}, 'ep': {'sk'},
        }
        self.assertEqual({k: set(v) for k, v in adj.items()}, expected)

    def test_symmetric(self):
        adj = sector_adjacency()
        for a, neighbours in adj.items():
            for b in neighbours:
                self.assertIn(a, adj[b], f'{a}-{b} must be symmetric')


class SensorsCase(unittest.TestCase):
    def setUp(self) -> None:
        svc.reset()
        fd, self.db_path = tempfile.mkstemp(suffix='.sqlite3')
        os.close(fd)
        self.app = create_app({
            'DB_PATH': self.db_path, 'REPORT_WORKER': False, 'SENSOR_WORKER': False,
            'DEMO_CODE': CODE, 'LOGIN_MIN_RESPONSE_S': 0, 'REPORT_SEND_DELAY_S': 0,
        })
        con = connect(self.db_path)
        con.execute('INSERT INTO users (id, login, password_hash, totp_secret, role, '
                    'is_active, created_at) VALUES (?,?,?,?,?,1,?)',
                    (new_id('u'), LOGIN, hash_password(PASSWORD), new_totp_secret(),
                     'operator', iso(utc_now())))
        con.close()
        self.client = self.app.test_client()

    def tearDown(self) -> None:
        svc.reset()
        os.unlink(self.db_path)

    def csrf(self) -> str:
        return self.client.get_cookie(self.app.config['CSRF_COOKIE']).value

    def auth_headers(self) -> dict[str, str]:
        return {'X-CSRF-Token': self.csrf()}

    def sign_in(self) -> None:
        self.client.post('/api/auth/login', json={'login': LOGIN, 'password': PASSWORD})
        self.client.post('/api/auth/code', json={'code': CODE}, headers=self.auth_headers())

    # --- parameter generator -----------------------------------------------

    def test_sample_params_matches_requested_verdict(self):
        for level in ('low', 'medium', 'high'):
            for _ in range(20):
                params = svc.sample_params(level)
                self.assertEqual(verdict_of_scores(score(params)), level,
                                  f'{level}: {params}')

    # --- Markov transitions --------------------------------------------------

    def test_ticks_never_skip_a_level(self):
        svc._rng.seed(20261115)
        svc.set_enabled(True)
        prev = {sid: 'low' for sid in svc._SECTOR_IDS}
        order = {'low': 0, 'medium': 1, 'high': 2}
        for _ in range(400):
            svc.tick(self.app)
            for sid in svc._SECTOR_IDS:
                cur = svc._state[sid]['level']
                self.assertLessEqual(abs(order[cur] - order[prev[sid]]), 1,
                                      f'{sid}: {prev[sid]} -> {cur} in a single tick')
                prev[sid] = cur

    def test_non_seed_non_neighbour_sectors_stay_low(self):
        svc._rng.seed(7)
        svc.set_enabled(True)
        for _ in range(60):
            svc.tick(self.app)
            if svc._seed:
                allowed = {svc._seed, *svc._ADJACENCY[svc._seed]}
                for sid in svc._SECTOR_IDS:
                    if sid not in allowed:
                        self.assertEqual(svc._state[sid]['level'], 'low')

    def test_first_tick_after_enable_is_a_full_report_round(self):
        svc.set_enabled(True)
        svc.tick(self.app)
        with self.app.app_context():
            rows = query('SELECT * FROM analyses WHERE source = ?', ('sensor',))
            reports = query("SELECT * FROM reports")
        self.assertEqual(len(rows), 7)
        self.assertEqual(len(reports), 7)

    def test_mid_cycle_tick_writes_without_report(self):
        """Between report rounds (report_every=10 with default config)
        a changed sector is written as an analysis without a report."""
        svc.set_enabled(True)
        svc.tick(self.app)  # tick 0 — always a full report round (report_round)
        with self.app.app_context():
            before = len(query('SELECT * FROM analyses'))

        svc._seed = 'km'
        svc._state['km'] = {'level': 'low', 'trend': 'rising'}
        real_random = svc._rng.random
        svc._rng.random = lambda: 0.0  # force an escalation step on this tick
        try:
            svc.tick(self.app)
        finally:
            svc._rng.random = real_random

        with self.app.app_context():
            rows = query('SELECT * FROM analyses ORDER BY id')
        self.assertEqual(len(rows), before + 1)
        newest = rows[-1]
        self.assertEqual(newest['source'], 'sensor')
        self.assertEqual(newest['sector'], 'km')
        with self.app.app_context():
            report = query('SELECT * FROM reports WHERE analysis_id = ?', (newest['id'],))
        self.assertEqual(report, [])

    def test_disabled_tick_does_nothing(self):
        svc.tick(self.app)
        with self.app.app_context():
            self.assertEqual(query('SELECT * FROM analyses'), [])

    # --- API -------------------------------------------------------------

    def test_status_requires_auth(self):
        self.assertEqual(self.client.get('/api/sensors').status_code, 401)

    def test_toggle_and_override_flow(self):
        self.sign_in()
        r = self.client.get('/api/sensors')
        self.assertEqual(r.get_json(), {'enabled': False, 'manual_override': False})

        r = self.client.post('/api/sensors/toggle', json={'enabled': True},
                              headers=self.auth_headers())
        self.assertEqual(r.get_json(), {'enabled': True, 'manual_override': False})

        # override has no effect while sensors are disabled
        svc.set_enabled(False)
        r = self.client.post('/api/sensors/override', json={'enabled': True},
                              headers=self.auth_headers())
        self.assertEqual(r.get_json()['manual_override'], False)

        svc.set_enabled(True)
        r = self.client.post('/api/sensors/override', json={'enabled': True},
                              headers=self.auth_headers())
        self.assertEqual(r.get_json(), {'enabled': True, 'manual_override': True})

        # re-enabling sensors resets the override
        r = self.client.post('/api/sensors/toggle', json={'enabled': True},
                              headers=self.auth_headers())
        self.assertEqual(r.get_json(), {'enabled': True, 'manual_override': False})


if __name__ == '__main__':
    unittest.main()
