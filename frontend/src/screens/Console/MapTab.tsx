/** "Map" tab. FUNCTIONAL_SPEC.md §8. */
import {
  DOT,
  MAT,
  SEC,
  VERDICT_RU,
  gravityRu,
} from '@/domain/reference';
import { f1, pad } from '@/domain/format';
import { score } from '@/domain/scoring';
import { summaryOf } from '@/domain/texts';
import { latestBySector, shipStatus } from '@/domain/ship';
import { useStore } from '@/state/store';
import { Card, CardHead, Dot, KeyValue } from '@/components/ui';
import { MapLegend, ShipMap } from '@/components/ShipMap';

export function MapTab() {
  const { state, dispatch } = useStore();
  const { hist, cur, tweaks } = state;
  const ship = shipStatus(hist);
  const last = latestBySector(hist);
  const sector = cur ? SEC[cur] : null;
  const entry = cur ? last[cur] : undefined;
  const scores = entry ? score(entry.p) : null;
  const recent = cur ? hist.filter((h) => h.sector === cur).slice().reverse().slice(0, 5) : [];

  return (
    <main className="main">
      <div className="map-main">
        <Card>
          <CardHead
            title="Ship Map"
            kicker="Select a sector to see its status and run an analysis."
          />
          <div className="card__body">
            <ShipMap
              variant="full"
              statusOf={ship.statusOf}
              selected={cur}
              onPick={(id) => dispatch({ type: 'pickSector', sector: id })}
            />
            <MapLegend />
            <span className="muted" style={{ fontSize: 12 }}>
              Placeholder diagram: the ship layout and compartment assignment are not defined in the specification.
            </span>
          </div>
        </Card>
      </div>

      <div className="map-side">
        <Card>
          {!sector ? (
            <>
              <CardHead title="No Sector Selected" />
              <div className="card__body">
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Click a compartment on the diagram. The analysis cannot be run until a sector is selected.
                </p>
              </div>
            </>
          ) : (
            <>
              <CardHead title={`${sector.code} · ${sector.name}`} kicker={sector.desc} />
              <div className="card__body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
                  <Dot color={DOT[ship.statusOf(sector.id)]} large />
                  <span>{entry ? VERDICT_RU[entry.v] : 'No data'}</span>
                  <span className="mono muted">
                    {scores ? `R${scores.risk} · E${scores.ext}` : '—'}
                  </span>
                </div>

                {entry && scores ? (
                  <>
                    <p style={{ margin: 0, fontSize: 13 }}>{summaryOf(scores)}</p>
                    <div>
                      <KeyValue k="Material" v={MAT[entry.p.material].label} />
                      <KeyValue k="Thickness" v={`${f1(entry.p.thickness)} mm`} />
                      <KeyValue k="Oxygen" v={`${f1(entry.p.o2)} %`} />
                      <KeyValue k="Air Flow" v={`${f1(entry.p.flow)} cm/s`} />
                      <KeyValue k="Temperature" v={`${entry.p.temp} °C`} />
                      <KeyValue k="Burn Time" v={`${entry.p.time} s`} />
                      <KeyValue k="Gravity" v={gravityRu(entry.p.gravity)} />
                    </div>
                  </>
                ) : (
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                    No analysis has been run in this sector yet.
                  </p>
                )}

                <div className="chip-row">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => dispatch({ type: 'tab', tab: 'analysis' })}
                  >
                    Analyze This Sector
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => dispatch({ type: 'tab', tab: 'overview' })}
                  >
                    Show on Overview
                  </button>
                </div>
              </div>

              <div className="card__section" style={{ gap: 0, paddingBottom: 0 }}>
                <span className="field__label">Recent Analyses</span>
              </div>
              <div className="list">
                {recent.length ? (
                  recent.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      className="list__row"
                      onClick={() => dispatch({ type: 'openAnalysis', entry: h })}
                    >
                      <Dot color={DOT[h.v]} />
                      <span className="mono">#{pad(h.id)}</span>
                      <span className="mono muted">{h.ts}</span>
                      <span className="card__spacer" style={{ fontSize: 12.5 }}>
                        {VERDICT_RU[h.v]}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="card__foot">No analyses in this sector yet.</div>
                )}
              </div>
            </>
          )}
        </Card>
        <span className="muted" style={{ fontSize: 12 }}>
          Indicator palette: {tweaks.palette === 'mono' ? 'monochrome' : 'signal'}.
        </span>
      </div>
    </main>
  );
}
