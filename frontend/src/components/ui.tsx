/** Мелкие переиспользуемые элементы интерфейса. */
import type { CSSProperties, ReactNode } from 'react';
import { DOT } from '@/domain/reference';
import type { SectorStatus } from '@/domain/types';

export function Dot({ color, large }: { color: string; large?: boolean }) {
  return <span className={large ? 'dot dot--lg' : 'dot'} style={{ background: color }} />;
}

export function StatusDot({ status, large }: { status: SectorStatus; large?: boolean }) {
  return <Dot color={DOT[status]} large={large} />;
}

export function Card({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section className={`card ${className}`} style={style}>
      {children}
    </section>
  );
}

export function CardHead({
  title,
  kicker,
  right,
}: {
  title: string;
  kicker?: string;
  right?: ReactNode;
}) {
  return (
    <header className="card__head">
      <h2 className="card__title">{title}</h2>
      {kicker ? <span className="card__kicker">{kicker}</span> : null}
      {right ? <span className="card__spacer">{right}</span> : null}
    </header>
  );
}

/** Полоса уверенности / прогресса. */
export function Bar({ percent, color }: { percent: number; color?: string }) {
  return (
    <div className="bar">
      <div
        className="bar__fill"
        style={{ width: `${percent}%`, background: color ?? 'var(--color-accent-700)' }}
      />
    </div>
  );
}

/**
 * Ячейки вклада параметра. Ячеек столько, сколько максимум балла (§9.7).
 */
export function Cells({
  value,
  max,
  fixed,
  filled = 'var(--color-accent-700)',
  empty = 'var(--color-neutral-300)',
}: {
  value: number;
  max: number;
  fixed?: boolean;
  filled?: string;
  empty?: string;
}) {
  return (
    <div className={fixed ? 'cells cells--fixed' : 'cells'}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className="cells__cell"
          style={{ background: i < value ? filled : empty }}
        />
      ))}
    </div>
  );
}

export function Tile({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="tile">
      <div className="tile__v" style={color ? { color } : undefined}>
        {v}
      </div>
      <div className="tile__k">{k}</div>
    </div>
  );
}

export function KeyValue({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv">
      <span className="kv__k">{k}</span>
      <span className="kv__v">{v}</span>
    </div>
  );
}

/** Вердикт с цветной полосой (§7.3, §9.7). */
export function VerdictBlock({
  label,
  subtitle,
  fill,
  ink,
}: {
  label: string;
  subtitle: string;
  fill: string;
  ink: string;
}) {
  return (
    <div className="verdict">
      <div className="verdict__bar" style={{ background: fill }} />
      <div>
        <div className="verdict__label" style={{ color: ink }}>
          {label}
        </div>
        <div className="verdict__sub">{subtitle}</div>
      </div>
    </div>
  );
}

export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="card__body">
      <div style={{ fontWeight: 600, fontSize: 15 }}>{title}</div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {text}
      </p>
    </div>
  );
}
