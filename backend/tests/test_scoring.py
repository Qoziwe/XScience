"""Control examples §23 — checks the server-side calculation against the spec's table."""
import unittest

from app.domain.scoring import (
    boundary_count, confidence_of, danger_index, score, verdict_of_scores,
)


def P(material, thickness, o2, flow, temp, time, gravity='microgravity', desc=''):
    return {'material': material, 'desc': desc, 'thickness': thickness, 'o2': o2,
            'flow': flow, 'gravity': gravity, 'temp': temp, 'time': time}


# §23: input, (M,O,F,T,S,G), R, level, (OD,LF,TB), E, level, D, verdict, boundaries, confidence
CASES = [
    ('A', P('paper', 0.5, 21, 5, 25, 30), (3, 2, 2, 0, 1, 1), 9, 'high',
     (0, 0, 2), 2, 'medium', 9, 'medium', 4, 62),
    ('B', P('plastic', 0.8, 28, 20, 150, 90), (3, 3, 2, 2, 3, 1), 14, 'high',
     (0, 0, 1), 1, 'low', 16, 'high', 0, 84),
    ('C', P('fabric', 5, 14, 0, 20, 5, 'earth'), (2, 0, 1, 0, 0, 0), 3, 'low',
     (3, 2, 0), 5, 'high', 2, 'low', 0, 94),
    ('D', P('wire_insulation', 0.4, 21, 0, 250, 20), (3, 2, 1, 3, 1, 1), 11, 'high',
     (0, 2, 2), 4, 'high', 10, 'high', 1, 86),
    ('E', P('paper', 0.1, 26, 30, 80, 90), (3, 3, 2, 1, 3, 1), 13, 'high',
     (0, 0, 3), 3, 'medium', 13, 'high', 0, 84),
    ('F', P('other', 1, 18.5, 3, 60, 45), (2, 2, 2, 1, 2, 1), 10, 'high',
     (1, 0, 1), 2, 'medium', 10, 'high', 1, 72),
]


class TestControlExamples(unittest.TestCase):
    def test_cases(self):
        for name, p, parts, risk, level, ext_parts, ext, ext_level, d, verdict, bnd, conf in CASES:
            with self.subTest(case=name):
                s = score(p)
                t = s['t']
                self.assertEqual(
                    (t['mat'], t['o2'], t['flow'], t['temp'], t['time'], t['grav']), parts)
                self.assertEqual((t['od'], t['lf'], t['th']), ext_parts)
                self.assertEqual(s['risk'], risk)
                self.assertEqual(s['level'], level)
                self.assertEqual(s['ext'], ext)
                self.assertEqual(s['extLevel'], ext_level)
                self.assertEqual(danger_index(s['risk'], s['ext']), d)
                self.assertEqual(verdict_of_scores(s), verdict)
                self.assertEqual(boundary_count(p), bnd)
                self.assertEqual(confidence_of(p), conf)

    def test_alert_level(self):
        """§10.1 — the alert window opens for medium and high, not for low."""
        for name, p, *_rest in CASES:
            v = verdict_of_scores(score(p))
            alert = None if v == 'low' else v
            self.assertEqual(alert, None if name == 'C' else v)


class TestShipAggregation(unittest.TestCase):
    def test_example_from_spec(self):
        """§23 — A in l1, B in ep, C in zh: worst=high, confidence 62."""
        from app.domain.ship import ship_status
        hist = []
        for i, (name, sector) in enumerate((('A', 'l1'), ('B', 'ep'), ('C', 'zh'))):
            p = next(c[1] for c in CASES if c[0] == name)
            s = score(p)
            hist.append({'id': i + 1, 'ts': '00:00:00', 'sector': sector, 'p': p,
                         'risk': s['risk'], 'ext': s['ext'], 'level': s['level'],
                         'extLevel': s['extLevel'], 'v': verdict_of_scores(s),
                         'conf': confidence_of(p), 'sent': None})
        st = ship_status(hist)
        self.assertEqual(st['worst'], 'high')
        self.assertEqual(st['analysed'], 3)
        self.assertEqual(st['total'], 7)
        self.assertEqual(st['confidence'], 62)
        self.assertEqual(st['counts'], {'high': 1, 'medium': 1, 'low': 1, 'none': 4})
        self.assertEqual(
            st['summary'],
            'Danger in sectors: PB. Attention needed: LB-1. '
            'Priority — neutralize the danger in the listed sectors.')
