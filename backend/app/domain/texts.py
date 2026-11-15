"""
Rule-based text generation. Port of frontend/src/domain/texts.ts (§15).
Rules are deterministic, no AI is used. Texts are stored together with the
analysis so the report never changes after the fact (§4.2, §15).
"""
from __future__ import annotations

from typing import Any

from .format import f1
from .reference import EXT_LEVEL_RU, MAT, SEC, VERDICT_RU
from .scoring import BOUNDARIES, Params, Scores, on_oxygen_boundary


def explain(p: Params, s: Scores) -> dict[str, str]:
    """§15.1 — risk and extinction explanation."""
    t = s['t']
    parts: list[str] = []
    if t['mat'] == 3:
        parts.append(f'{MAT[p["material"]]["label"].lower()} is a highly flammable material')
    if t['o2'] == 3:
        parts.append(f'oxygen above normal ({f1(p["o2"])} %)')
    if t['flow'] == 3:
        parts.append(f'flow of {f1(p["flow"])} cm/s actively feeds the flame')
    if t['temp'] >= 2:
        parts.append(f'high temperature in the combustion zone ({f1(p["temp"])} °C)')
    if t['time'] >= 2:
        parts.append(f'prolonged burning ({f1(p["time"])} s)')
    if t['grav'] == 1:
        parts.append('microgravity increases the uncertainty of flame behavior')

    why = (f'Risk is increased by: {"; ".join(parts)}.' if parts else
           'All factors are at minimum values — conditions do not support flame development.')

    e: list[str] = []
    if t['od'] >= 2:
        e.append(f'oxygen deficiency ({f1(p["o2"])} %)')
    if t['lf'] >= 1:
        e.append('no air flow' if p['flow'] == 0 else 'weak air flow')
    if t['th'] >= 2:
        e.append(f'thin material ({f1(p["thickness"])} mm)')

    tail = ' — ' + ', '.join(e) if e else ', no extinction factors'
    why_ext = f'Extinction: {EXT_LEVEL_RU[s["extLevel"]].lower()} probability{tail}.'
    return {'why': why, 'why_ext': why_ext}


def summary_of(s: Scores) -> str:
    """§15.2 — conclusion."""
    if s['level'] == 'high' and s['extLevel'] == 'high':
        return ('Combustion is unstable: conditions simultaneously support rapid spread '
                'and flame extinguishment. Monitoring is required — reignition is possible after extinguishment.')
    if s['level'] == 'high':
        return ('The combination of material, oxygen, and flow creates conditions for rapid '
                'flame spread. Extinction is unlikely — intervention is required.')
    if s['level'] == 'medium':
        return ('Individual parameters increase the hazard, but conditions for sustained rapid '
                'combustion have not developed. Monitoring and addressing the leading factor is sufficient.')
    return ('All factors are at minimum values. '
            'There is no threat to the sector at current readings.')


#: §15.4 — sector-specific actions. [QUESTION 16.15] not aligned with crew protocols.
SECTOR_ACTION: dict[str, tuple[str, str]] = {
    'sh': ('Close the airlock hatches', 'Prevent fire and smoke from spreading to adjacent compartments.'),
    'km': ('Transfer control to the backup station',
           'Preserve ship communication and control until the fire is contained.'),
    'zh': ('Evacuate the crew from the sector',
           'Gather crew in a safe module and account for everyone.'),
    'l1': ('Stop the experiment and shut off gas supply',
           'De-energize sector equipment and shut off gas lines.'),
    'l2': ('Stop the experiment and shut off gas supply',
           'De-energize sector equipment and shut off gas lines.'),
    'sk': ('Isolate racks and containers',
           'Do not move flammable cargo until the fire is extinguished.'),
    'ep': ('Switch power to backup lines',
           'Disconnect the damaged bus to preserve power to other sectors.'),
}


def recommendations(p: Params, s: Scores, sector_id: str, v: str) -> dict[str, Any]:
    """
    §15.3–15.4 — the SINGLE recommendation generator: the recommendations window, the
    report, and the "Recommended Actions" block (first 3 steps) all draw from the same list.
    """
    sec = SEC[sector_id]
    electrical = p['material'] == 'wire_insulation' or sector_id == 'ep'
    st: list[tuple[str, str]] = []

    if electrical:
        st.append(('De-energize the line and the heat source',
                   'Wiring combustion is sustained by current: as long as the line is live, '
                   'extinguishing is largely ineffective.'))
    elif s['t']['temp'] >= 2:
        st.append(('Shut off the heat source',
                   f'Temperature of {f1(p["temp"])} °C in the combustion zone accelerates material heating.'))

    if s['t']['o2'] == 3 or s['t']['flow'] == 3:
        st.append(('Reduce the oxygen supply',
                   'Stop sector ventilation and O₂ supply, shut off air ducts.'))

    if v != 'low':
        st.append(SECTOR_ACTION[sector_id])

    if s['level'] == 'high':
        st.append(('Isolate the fire',
                   'Separate flammable materials from the fire, prevent flame spread '
                   'to adjacent sectors.'))

    if v != 'low':
        st.append(('Apply the appropriate extinguishing method',
                   'For electrical equipment — non-aqueous agent only.' if electrical
                   else 'Choose an agent based on the material type.'))

    if s['extLevel'] == 'high' and v != 'low':
        st.append(('Keep monitoring after the flame goes out',
                   'The flame is unstable: reignition is possible.'))

    if v == 'low':
        st.append(('Continue monitoring',
                   'Sector conditions do not support flame development, no action required.'))

    st.append(('Confirm report receipt on Earth',
               'The report is transmitted automatically; report the measures taken.'))

    return {
        'intro': (f'Sector {sec["code"]}: {VERDICT_RU[v].lower()}. '
                  f'RiskScore {s["risk"]} of 16, ExtinctionScore {s["ext"]} of 8. '
                  'Recommendations prepared by the AI module (generation mock-up) and require '
                  'alignment with onboard protocols.'),
        'steps': [{'n': str(i + 1).zfill(2), 'title': title, 'detail': detail}
                  for i, (title, detail) in enumerate(st)],
    }


def notes_of(p: Params, s: Scores) -> list[dict[str, str]]:
    """§15.5 — "Calculation Assumptions"."""
    notes: list[dict[str, str]] = []
    if on_oxygen_boundary(p['o2']):
        notes.append({'ref': '16.1',
                      'text': f'O₂ = {f1(p["o2"])} % is on an uncertain boundary: '
                              f'OxygenRisk = {s["t"]["o2"]}, OxygenDeficit = {s["t"]["od"]}.'})
    if p['flow'] in BOUNDARIES['flow']:
        notes.append({'ref': '16.1',
                      'text': f'Flow {f1(p["flow"])} cm/s is on a range boundary: '
                              f'FlowRisk = {s["t"]["flow"]}, LowFlowPenalty = {s["t"]["lf"]}.'})
    if p['temp'] in BOUNDARIES['temp']:
        notes.append({'ref': '16.1',
                      'text': f'Temperature {f1(p["temp"])} °C is on a boundary: '
                              f'TemperatureRisk = {s["t"]["temp"]}.'})
    if p['time'] in BOUNDARIES['time']:
        notes.append({'ref': '16.1',
                      'text': f'Time {f1(p["time"])} s is on a boundary: TimeRisk = {s["t"]["time"]}.'})
    if p['thickness'] in BOUNDARIES['thickness']:
        notes.append({'ref': '16.1',
                      'text': f'Thickness {f1(p["thickness"])} mm is on a boundary: '
                              f'ThicknessBonus = {s["t"]["th"]}.'})
    if p['material'] == 'other':
        notes.append({'ref': '16.6',
                      'text': '"Other": base risk 2, the description is not factored into the calculation.'})
    notes.append({'ref': '16.4',
                  'text': 'The "low" level is only reachable at RiskScore = 3 — '
                          'the scale is skewed toward "high".'})
    notes.append({'ref': '—',
                  'text': 'Gravity is accounted for as a category. '
                          'No forecast is built from g-level and flame size.'})
    return notes
