import { useState } from 'react';
import { CSS_CHANNEL } from '../../styles/tokens';
import './Chart.css';
import { channelGradient, type ChannelName } from '../../styles/tokens';
import {
  METRICS, domainFor, formatMetric, isRatio, yTicks as computeTicks,
  type Metric,
} from '../../data/metrics';
import { resolveMark, type Mark } from './mark';
import { MetricToggle } from '../MetricToggle/MetricToggle';

export { METRICS };
export type { Metric };
export type { Mark };

export interface ChartProps {
  title?: string;
  channel: ChannelName | 'all';
  metric: Metric;
  onMetricChange?: (m: Metric) => void;
  data: { label: string; value: number }[];
  /** Override the mark. Default 'auto' applies the rule below. */
  mark?: Mark;
  state?: 'ready' | 'loading' | 'error' | 'empty';
}


export function Chart({
  title,
  channel,
  metric,
  onMetricChange,
  data,
  mark = 'auto',
  state = 'ready',
}: ChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const resolved = resolveMark(metric, data.length, mark);
  // Bars must start at zero; a ratio line must not.
  const zeroBased = resolved === 'bar' || !isRatio(metric);
  const ticks = computeTicks(metric, data, zeroBased);
  const [lo, hi] = domainFor(data, zeroBased);
  const span = hi - lo || 1;

  const key = channel === 'all' ? 'accent' : (CSS_CHANNEL[channel] ?? channel);
  const stroke = channel === 'all' ? 'var(--accent-base)' : `var(--channel-${key})`;
  const fill = channel === 'all'
    ? 'linear-gradient(to bottom, var(--accent-gradient-top), var(--accent-gradient-bottom))'
    : channelGradient(channel);
  const edge = channel === 'all' ? 'var(--accent-gradient-bottom)' : `var(--channel-${key}-soft)`;

  /* Normalised 0-100 viewBox with preserveAspectRatio="none", so the path
     stretches to the plot. vector-effect keeps the stroke 2px regardless. */
  const pointAt = (i: number) => ({
    x: data.length === 1 ? 50 : (i / (data.length - 1)) * 100,
    y: 100 - ((data[i].value - lo) / span) * 100,
  });
  const linePath = data.map((_, i) => {
    const { x, y } = pointAt(i);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  const areaPath = `${linePath} L 100 100 L 0 100 Z`;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - box.left) / box.width;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1)))));
  }

  const hovered = hover !== null ? data[hover] : null;
  const hoverX = hover !== null ? pointAt(hover).x : 0;

  return (
    <section className="gr-chart" aria-label={title ?? `${metric} over time`}>
      <header className="gr-chart__header">
        <h3 className="gr-chart__title gr-type-card-heading">{title ?? `${metric} over time`}</h3>
        <MetricToggle value={metric} onChange={(m) => onMetricChange?.(m)} />
      </header>

      {state === 'ready' ? (
        <div className="gr-chart__body">
          <div className="gr-chart__plot">
            <div className="gr-chart__y" aria-hidden="true">
              {ticks.map((t, i) => <span key={i} className="gr-type-micro">{t}</span>)}
            </div>

            <div
              className="gr-chart__canvas"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            >
              {resolved === 'bar' ? (
                <ol className="gr-chart__bars">
                  {data.map((d, i) => (
                    <li key={i} className="gr-chart__bar-slot">
                      <span
                        className={`gr-chart__bar ${hover === i ? 'is-hovered' : ''}`}
                        style={{
                          height: `${((d.value - lo) / span) * 100}%`,
                          background: fill,
                          borderColor: edge,
                        }}
                      />
                    </li>
                  ))}
                </ol>
              ) : (
                <svg className="gr-chart__svg" viewBox="0 0 100 100"
                     preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={stroke} stopOpacity="0.28" />
                      <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={areaPath} fill={`url(#grad-${key})`} />
                  <path
                    d={linePath}
                    fill="none"
                    stroke={stroke}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}

              {hovered && (
                <>
                  <span className="gr-chart__crosshair" style={{ left: `${hoverX}%` }} aria-hidden="true" />
                  {resolved === 'line' && (
                    <span
                      className="gr-chart__marker"
                      style={{
                        left: `${hoverX}%`,
                        top: `${pointAt(hover!).y}%`,
                        borderColor: stroke,
                      }}
                      aria-hidden="true"
                    />
                  )}
                  <div
                    className="gr-chart__tip"
                    style={{ left: `${hoverX}%` }}
                    role="status"
                  >
                    <span className="gr-chart__tip-label gr-type-micro">{hovered.label}</span>
                    <span className="gr-chart__tip-value gr-type-caption-med">
                      {formatMetric(metric, hovered.value)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="gr-chart__baseline" />
          <div className="gr-chart__x" aria-hidden="true">
            {data.map((d, i) => (
              <span key={i} className="gr-type-micro">
                {i % Math.ceil(data.length / 5) === 0 ? d.label : ''}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className={`gr-chart__state gr-chart__state--${state}`} role="status">
          {state === 'loading' && <span className="gr-type-body">Loading {metric.toLowerCase()}…</span>}
          {state === 'error' && (
            <span className="gr-type-body">
              Could not reach the {channel} API.{' '}
              <button type="button" className="gr-chart__retry">Retry</button>
            </span>
          )}
          {state === 'empty' && (
            <span className="gr-type-body">No {metric.toLowerCase()} recorded for this period.</span>
          )}
        </div>
      )}
    </section>
  );
}
