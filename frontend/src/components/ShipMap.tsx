/** Схема корабля. FUNCTIONAL_SPEC.md §7.5 (мини) и §8.1 (полная). */
import { MAP_FILL, SECTORS, STATUS_LEGEND, STATUS_WORD } from '@/domain/reference';
import type { SectorId, SectorStatus } from '@/domain/types';

export interface ShipMapProps {
  statusOf: (id: SectorId) => SectorStatus;
  selected: SectorId | null;
  onPick: (id: SectorId) => void;
  /** Мини-карта показывает только метку сектора; полная — метку, название и статус. */
  variant: 'mini' | 'full';
}

export function ShipMap({ statusOf, selected, onPick, variant }: ShipMapProps) {
  const mini = variant === 'mini';
  return (
    <div className="map">
      <svg viewBox="0 0 720 250" role="img" aria-label="Схема корабля по секторам">
        <line
          x1={94}
          y1={130}
          x2={626}
          y2={130}
          stroke="var(--color-neutral-300)"
          strokeWidth={8}
          strokeLinecap="round"
        />
        {SECTORS.map((s) => {
          const status = statusOf(s.id);
          const [bg, fg, stroke] = MAP_FILL[status];
          const on = selected === s.id;
          const cx = s.x + s.w / 2;
          const cy = s.y + s.h / 2;
          return (
            <g
              key={s.id}
              className="map__sector"
              onClick={() => onPick(s.id)}
              role="button"
              tabIndex={0}
              aria-label={`${s.code} · ${s.name}, ${STATUS_WORD[status]}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPick(s.id);
                }
              }}
            >
              <rect
                x={s.x}
                y={s.y}
                width={s.w}
                height={s.h}
                rx={16}
                fill={bg}
                stroke={on ? 'var(--color-accent-900)' : stroke}
                strokeWidth={on ? 4 : 1.5}
              />
              {mini ? (
                <text
                  className="map__label"
                  x={cx}
                  y={cy + 9}
                  textAnchor="middle"
                  fontSize={26}
                  fill={fg}
                >
                  {s.code}
                </text>
              ) : (
                <>
                  <text
                    className="map__label"
                    x={cx}
                    y={cy - 6}
                    textAnchor="middle"
                    fontSize={17}
                    fill={fg}
                  >
                    {s.code}
                  </text>
                  <text
                    className="map__name"
                    x={cx}
                    y={cy + 11}
                    textAnchor="middle"
                    fontSize={11.5}
                    fill={fg}
                  >
                    {s.name}
                  </text>
                  <text
                    className="map__word"
                    x={cx}
                    y={cy + 27}
                    textAnchor="middle"
                    fontSize={11}
                    fill={fg}
                  >
                    {STATUS_WORD[status]}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function MapLegend() {
  const keys: SectorStatus[] = ['none', 'low', 'medium', 'high'];
  return (
    <div className="legend">
      {keys.map((k) => (
        <span className="legend__item" key={k}>
          <span
            className="legend__swatch"
            style={{ background: MAP_FILL[k][0], borderColor: MAP_FILL[k][2] }}
          />
          {STATUS_LEGEND[k]}
        </span>
      ))}
    </div>
  );
}
