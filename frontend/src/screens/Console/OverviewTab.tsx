/** "Overview" tab. FUNCTIONAL_SPEC.md §7. */
import {
  EXT_LEVEL_RU,
  RISK_LEVEL_RU,
  SEC,
  SECTORS,
  VERDICT_RU,
  VERDICT_SUBTITLE,
  sentShort,
  signalOf,
} from '@/domain/reference';
import { pad } from '@/domain/format';
import { boundaryCount, score } from '@/domain/scoring';
import { summaryOf } from '@/domain/texts';
import { latestBySector, shipStatus } from '@/domain/ship';
import { useStore } from '@/state/store';
import { Bar, Card, CardHead, Empty, StatusDot, Tile, VerdictBlock } from '@/components/ui';
import { MapLegend, ShipMap } from '@/components/ShipMap';

export function OverviewTab() {
  const { state, dispatch } = useStore();
  const { hist, cur, tweaks } = state;
  const ship = shipStatus(hist);
  const last = latestBySector(hist);
  const sectorEntry = cur ? last[cur] : undefined;

  const openRecs = (id: number) => dispatch({ type: 'modal', modal: { id, view: 'recs' } });

  return (
    <main className="main">
      <div className="stack">
        {/* §7.1 — danger banner */}
        {ship.dangers.length ? (
          <div className="banner">
            <span className="banner__tag">DANGER</span>
            <span>
              {ship.dangers.length === 1
                ? `Sector ${SEC[ship.dangers[0]].code} · ${SEC[ship.dangers[0]].name}. Immediate action required.`
                : `Sectors: ${ship.dangers.map((id) => SEC[id].code).join(', ')}. Immediate action required.`}
            </span>
            <button
              type="button"
              className="banner__btn"
              onClick={() => ship.latestDanger && openRecs(ship.latestDanger.id)}
            >
              Open Recommendations
            </button>
          </div>
        ) : null}

        {/* §7.2 — header row */}
        <div className="card__head" style={{ padding: 0 }}>
          <h1 className="card__title" style={{ fontSize: 20 }}>
            Overview
          </h1>
          <div className="chip-row">
            <button
              type="button"
              className="chip"
              aria-pressed={!cur}
              onClick={() => dispatch({ type: 'pickSector', sector: null })}
            >
              Whole Ship
            </button>
            {cur ? (
              <button
                type="button"
                className="chip"
                aria-pressed
                onClick={() => dispatch({ type: 'pickSector', sector: null })}
              >
                {SEC[cur].code} · {SEC[cur].name} ×
              </button>
            ) : null}
          </div>
          <span className="card__spacer">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => dispatch({ type: 'tab', tab: 'analysis' })}
            >
              {cur ? 'Analyze Sector' : 'New Analysis'}
            </button>
          </span>
        </div>

        {/* §7.3 — assessment card, §7.5 — mini-map: in the original they sit in one row,
            the assessment card grows first (flex 999), the map is a narrow sidebar (max 480px). */}
        <div className="ov-row">
          <Card className="ov-main">
            <div className="card__head ov-score-head">
              <h2 className="card__title">
                {cur ? 'Sector Assessment' : 'Overall Ship Assessment'}
              </h2>
              <span className="card__kicker">
                {cur ? `${SEC[cur].code} · ${SEC[cur].name}` : 'all sectors'}
              </span>
              <span className="card__spacer card__kicker">AI module · mock-up</span>
            </div>
            {!cur && !ship.analysed ? (
              <Empty
                title="No Data Yet"
                text="Run an analysis in any sector — the result will appear here and color the sector on the map."
              />
            ) : null}
            {cur && !sectorEntry ? (
              <Empty
                title="No Data Yet"
                text={`No analysis has been run in sector ${SEC[cur].code} yet.`}
              />
            ) : null}

            {!cur && ship.analysed ? (
              <ShipAssessment ship={ship} palette={tweaks.palette} />
            ) : null}

            {cur && sectorEntry ? (
              <SectorAssessment
                entryId={sectorEntry.id}
                onOpenResult={() =>
                  dispatch({ type: 'openAnalysis', entry: sectorEntry })
                }
                onOpenRecs={() => openRecs(sectorEntry.id)}
                onOpenReport={() => {
                  dispatch({ type: 'repId', id: sectorEntry.id });
                  dispatch({ type: 'tab', tab: 'reports' });
                }}
                scores={score(sectorEntry.p)}
                verdict={sectorEntry.v}
                conf={sectorEntry.conf}
                boundaries={boundaryCount(sectorEntry.p)}
                ts={sectorEntry.ts}
                palette={tweaks.palette}
              />
            ) : null}
          </Card>

          <Card className="ov-map">
            <div className="ov-map-head">
              <span className="ov-map-label">Ship Map</span>
              <button
                type="button"
                className="btn--link card__spacer"
                onClick={() => dispatch({ type: 'tab', tab: 'map' })}
              >
                Open Map
              </button>
            </div>
            <ShipMap
              variant="mini"
              statusOf={ship.statusOf}
              selected={cur}
              onPick={(id) => dispatch({ type: 'pickSector', sector: id })}
            />
            <MapLegend />
            <span className="muted" style={{ fontSize: 12 }}>
              Click a sector — the assessment above will show it alone.
            </span>
          </Card>
        </div>

        {/* §7.6 — sectors table */}
        <Card>
          <CardHead title="Sectors" />
          <div className="table-wrap">
            <table className="table table--sectors">
              <thead>
                <tr>
                  <th>Sector</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Scores</th>
                  <th>Last Analysis</th>
                  <th>Report</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {SECTORS.map((s) => {
                  const e = last[s.id];
                  const st = ship.statusOf(s.id);
                  const sc = e ? score(e.p) : null;
                  return (
                    <tr
                      key={s.id}
                      data-click="1"
                      data-selected={cur === s.id ? '1' : undefined}
                      onClick={() => dispatch({ type: 'pickSector', sector: s.id })}
                    >
                      <td className="mono">{s.code}</td>
                      <td>{s.name}</td>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <StatusDot status={st} />
                          {e ? VERDICT_RU[e.v] : 'No data'}
                        </span>
                      </td>
                      <td className="mono">{sc ? `R${sc.risk} · E${sc.ext}` : '—'}</td>
                      <td className="mono">{e ? e.ts : '—'}</td>
                      <td>{e ? sentShort(e.sent) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            dispatch({ type: 'pickSector', sector: s.id });
                            dispatch({ type: 'tab', tab: 'analysis' });
                          }}
                        >
                          Analyze →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </main>
  );
}

function ShipAssessment({
  ship,
  palette,
}: {
  ship: ReturnType<typeof shipStatus>;
  palette: 'signal' | 'mono';
}) {
  const sig = signalOf(ship.worst!, palette);
  return (
    <>
      <div className="ov-score-grid">
        <div>
            <VerdictBlock
              label={ship.verdict!}
              subtitle={ship.subtitle!}
              fill={sig.fill}
              ink={sig.ink}
            />
            <p style={{ margin: 0, fontSize: 13.5 }}>{ship.summary}</p>
        </div>
        <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>
              Assessment confidence <span className="mono">{ship.confidence} %</span>
            </div>
            <Bar percent={ship.confidence!} color={sig.fill} />
            <span className="muted" style={{ fontSize: 12 }}>
              {ship.confNote}
            </span>
            <div className="tiles">
              <Tile
                k="Dangerous"
                v={String(ship.counts.high)}
                color={ship.counts.high ? 'oklch(0.46 0.15 28)' : undefined}
              />
              <Tile k="Needs Attention" v={String(ship.counts.medium)} />
              <Tile k="Safe" v={String(ship.counts.low)} />
              <Tile k="No Data" v={String(ship.counts.none)} />
            </div>
        </div>
      </div>
      <div className="card__foot">
        Based on the latest analyses for {ship.analysed} of {ship.total} sectors. The assessment
        is advisory, the crew decides.
      </div>
    </>
  );
}

function SectorAssessment(props: {
  entryId: number;
  scores: ReturnType<typeof score>;
  verdict: 'low' | 'medium' | 'high';
  conf: number;
  boundaries: number;
  ts: string;
  palette: 'signal' | 'mono';
  onOpenResult: () => void;
  onOpenRecs: () => void;
  onOpenReport: () => void;
}) {
  const sig = signalOf(props.verdict, props.palette);
  return (
    <>
      <div className="ov-score-grid">
        <div>
            <VerdictBlock
              label={VERDICT_RU[props.verdict]}
              subtitle={VERDICT_SUBTITLE[props.verdict]}
              fill={sig.fill}
              ink={sig.ink}
            />
            <p style={{ margin: 0, fontSize: 13.5 }}>{summaryOf(props.scores)}</p>
            <div className="chip-row">
              <button type="button" className="btn" onClick={props.onOpenResult}>
                Open Result
              </button>
              <button type="button" className="btn" onClick={props.onOpenRecs}>
                Recommendations
              </button>
              <button type="button" className="btn" onClick={props.onOpenReport}>
                Report
              </button>
            </div>
        </div>
        <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>
              Assessment confidence <span className="mono">{props.conf} %</span>
            </div>
            <Bar percent={props.conf} color={sig.fill} />
            <span className="muted" style={{ fontSize: 12 }}>
              {props.boundaries
                ? `Reduced: ${props.boundaries} value(s) on uncertain boundaries (16.1).`
                : 'All readings are within well-defined ranges.'}
            </span>
            <div className="tiles">
              <Tile k="RiskScore" v={`${props.scores.risk} / 16`} />
              <Tile k="ExtinctionScore" v={`${props.scores.ext} / 8`} />
              <Tile k="Risk" v={RISK_LEVEL_RU[props.scores.level]} />
              <Tile k="Extinction" v={EXT_LEVEL_RU[props.scores.extLevel]} />
            </div>
        </div>
      </div>
      <div className="card__foot">
        Analysis #{pad(props.entryId)} · {props.ts}. The assessment is advisory, the crew
        decides.
      </div>
    </>
  );
}
