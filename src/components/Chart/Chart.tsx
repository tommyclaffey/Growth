import './Chart.css';
import { channelGradient, type ChannelName } from '../../styles/tokens';

/* Metric is owned by the data layer, not by the chart. The chart renders a
   series; it does not get to decide what the business measures. */
import { METRICS, type Metric } from '../../data/metrics';
export { METRICS };
export type { Metric };

export interface ChartProps {
  title?: string;
  channel: ChannelName | 'all';
  metric: Metric;
  onMetricChange?: (m: Metric) => void;
  /** 24 points. Values are absolute; the chart scales to its own max. */
  data: { label: string; value: number }[];
  yTicks?: string[];
  state?: 'ready' | 'loading' | 'error' | 'empty';
}

const CSS_CHANNEL: Record<string, string> = {
  meta: 'meta',
  tiktok: 'tiktok',
  youtube: 'youtube',
  affiliates: 'affiliates',
  paidSearch: 'paid-search',
  podcasts: 'podcasts',
};

/**
 * Chart — 1172x352, radius/xl.
 *
 * Bars use a vertical gradient: light at the top, deeper at the bottom.
 * The direction matters. THE TOP EDGE IS THE DATA — it is the line the eye
 * lands on to compare magnitudes — so it keeps the saturated stop. Running the
 * gradient the other way makes the bar read flat and weakens the encoding.
 *
 * Every channel resolves through channel/<name> and channel/<name>-soft, which
 * invert between light and dark so the gradient keeps its travel in both modes.
 *
 * loading / error / empty are real states, not an afterthought. Growth runs on
 * channel API syncs; a chart that cannot reach the Meta API is a state that
 * exists whether or not anyone designed it.
 */
export function Chart({
  title,
  channel,
  metric,
  onMetricChange,
  data,
  yTicks = ['$6k', '$4k', '$2k', '$0'],
  state = 'ready',
}: ChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);

  const fill =
    channel === 'all'
      ? 'linear-gradient(to bottom, var(--accent-gradient-top), var(--accent-gradient-bottom))'
      : channelGradient(channel);

  const edge =
    channel === 'all'
      ? 'var(--accent-gradient-bottom)'
      : `var(--channel-${CSS_CHANNEL[channel] ?? channel}-soft)`;

  return (
    <section className="gr-chart" aria-label={title ?? `${metric} over time`}>
      <header className="gr-chart__header">
        <h3 className="gr-chart__title gr-type-card-heading">{title ?? `${metric} over time`}</h3>
        <div className="gr-chart__toggle" role="tablist" aria-label="Metric">
          {METRICS.map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={m === metric}
              className={`gr-chart__seg gr-type-label-button ${m === metric ? 'is-active' : ''}`}
              onClick={() => onMetricChange?.(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      {state === 'ready' ? (
        <div className="gr-chart__body">
          <div className="gr-chart__plot">
            <div className="gr-chart__y" aria-hidden="true">
              {yTicks.map((t) => (
                <span key={t} className="gr-type-micro">{t}</span>
              ))}
            </div>
            <ol className="gr-chart__bars">
              {data.map((d, i) => (
                <li key={i} className="gr-chart__bar-slot">
                  <span
                    className="gr-chart__bar"
                    style={{
                      height: `${(d.value / max) * 100}%`,
                      background: fill,
                      borderColor: edge,
                    }}
                    title={`${d.label}: ${d.value.toLocaleString()}`}
                  />
                </li>
              ))}
            </ol>
          </div>
          <div className="gr-chart__baseline" />
          <div className="gr-chart__x" aria-hidden="true">
            {data.map((d, i) => (
              <span key={i} className="gr-type-micro">{i % 7 === 0 ? d.label : ''}</span>
            ))}
          </div>
        </div>
      ) : (
        <div className={`gr-chart__state gr-chart__state--${state}`} role="status">
          {state === 'loading' && (
            <span className="gr-type-body">Loading {metric.toLowerCase()}…</span>
          )}
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
