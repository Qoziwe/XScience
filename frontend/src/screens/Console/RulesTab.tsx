/** "Rules" tab. FUNCTIONAL_SPEC.md §13. */
import { MAT, gravityShort } from '@/domain/reference';
import { f1, pn } from '@/domain/format';
import { RULE_CARDS, type RuleCard } from '@/domain/rules';
import { ISSUES, ISSUES_SUMMARY } from '@/domain/issues';
import type { PartialScores } from '@/domain/types';
import { useStore } from '@/state/store';
import { useFormModel } from '@/state/useForm';
import { Card, CardHead } from '@/components/ui';

export function RulesTab() {
  const { state } = useStore();
  const model = useFormModel();
  const { form } = state;
  const { status, live, totals } = model;

  // A range is highlighted only if the corresponding field's status is ok.
  const t: Partial<PartialScores> = Object.fromEntries(
    Object.entries(live).filter(([, v]) => v !== null),
  ) as Partial<PartialScores>;
  const rawFlow = status.flow === 'ok' ? pn(form.flow) : NaN;

  const currentValue = (c: RuleCard): string => {
    switch (c.field) {
      case 'material':
        return status.material === 'ok' ? MAT[form.material!].label : '—';
      case 'o2':
        return status.o2 === 'ok' ? `${f1(pn(form.o2))} %` : '—';
      case 'flow':
        return status.flow === 'ok' ? `${f1(pn(form.flow))} cm/s` : '—';
      case 'temp':
        return status.temp === 'ok' ? `${pn(form.temp)} °C` : '—';
      case 'time':
        return status.time === 'ok' ? `${pn(form.time)} s` : '—';
      case 'gravity':
        return status.gravity === 'ok' ? gravityShort(form.gravity!) : '—';
      case 'thickness':
        return status.thickness === 'ok' ? `${f1(pn(form.thickness))} mm` : '—';
    }
  };

  return (
    <main className="main">
      <div className="stack">
        <Card>
          <CardHead
            title="Scoring Rules"
            kicker="a range is highlighted when the corresponding form field is filled in"
          />
          <div className="card__body">
            <div className="mono" style={{ fontSize: 13 }}>
              Material + Oxygen + Flow + Temperature + Time + Gravity ={' '}
              <strong>{totals.risk}</strong>
            </div>
            <div className="mono" style={{ fontSize: 13 }}>
              OxygenDeficit + LowFlowPenalty + ThicknessBonus = <strong>{totals.ext}</strong>
            </div>
          </div>
        </Card>

        <div className="two-col" style={{ flexWrap: 'wrap' }}>
          {RULE_CARDS.map((c) => (
            <Card key={c.code} style={{ flex: '1 1 300px' }}>
              <CardHead title={c.name} kicker={c.code} right={
                <span className="mono muted" style={{ fontSize: 12 }}>{currentValue(c)}</span>
              } />
              <div className="card__body">
                {c.bands.map((b) => {
                  const on = b.on(t, { flow: rawFlow });
                  return (
                    <div
                      key={b.range}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '6px 10px',
                        borderRadius: 8,
                        background: on ? 'var(--color-accent-100)' : 'transparent',
                        fontSize: 12.5,
                      }}
                    >
                      <span
                        className="dot"
                        style={{
                          background: on ? 'var(--color-accent-700)' : 'var(--color-neutral-300)',
                        }}
                      />
                      <span>{b.range}</span>
                      <span className="card__spacer mono">{b.score}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>

        <Card>
          <CardHead title="Open Specification Questions" kicker={ISSUES_SUMMARY} />
          <div className="card__body">
            {ISSUES.map((i) => (
              <div
                key={i.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 12.5,
                  color: i.done ? 'var(--color-neutral-700)' : 'var(--color-text)',
                }}
              >
                <span className="mono" style={{ width: 40, flex: 'none' }}>
                  {i.id}
                </span>
                <span>{i.title}</span>
                <span
                  className="card__spacer chip"
                  style={{
                    cursor: 'default',
                    background: i.done ? 'var(--color-neutral-200)' : 'var(--color-accent-100)',
                  }}
                >
                  {i.done ? 'resolved' : 'open'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
