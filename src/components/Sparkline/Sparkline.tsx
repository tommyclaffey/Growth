import './Sparkline.css';
import { CSS_CHANNEL } from '../../styles/tokens';
import { channelGradient, type ChannelName } from '../../styles/tokens';
import { isRatio, type Metric, type Tone } from '../../data/metrics';


export interface SparklineProps {
  /** Raw values. Scaling happens here so callers cannot each invent their own. */
  values: number[];
  /** Drives the mark: ratios get a line, quantities get bars. */
  metric?: Metric;
  /** Tints to the channel, matching the chart it summarises. */
  channel?: ChannelName | 'all';
  /**
   * The verdict on the change this trend describes.
   *
   * Without it the mark was tinted by channel while the badge beside it was
   * tinted by good/bad -- so a declining ROAS showed a red badge next to an
   * amber line, and the two halves of one statement disagreed. Passing the
   * tone makes the mark carry the same reading as the number.
   *
   * Channel identity is not lost: every place a sparkline appears, the channel
   * is already named and marked in the same row or card header.
   */
  tone?: Tone;
  width?: number;
  height?: number;
}

/**
 * Sparkline — the small trend mark in KPI cards and table rows.
 *
 * One component, because it was being drawn twice: KpiCard and ChannelTable
 * each had their own bars, their own widths and their own gap. Two copies of
 * one mark is how they end up disagreeing.
 *
 * It follows the same rule as Chart: a ratio gets a line, a quantity gets
 * bars. It would be strange for the big chart to refuse to draw ROAS as bars
 * on the grounds that ratios do not accumulate, while the little chart four
 * inches away did it anyway.
 *
 * Bars are scaled from the series minimum, not from zero, and keep a 15%
 * floor so a low point stays visible as a mark rather than vanishing. At this
 * size the shape is the message; the axis is not readable regardless.
 */
export function Sparkline({
  values,
  metric,
  channel = 'all',
  tone,
  width = 56,
  height = 14,
}: SparklineProps) {
  if (values.length === 0) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const norm = values.map((v) => 0.15 + ((v - min) / span) * 0.85);

  const key = channel === 'all' ? null : (CSS_CHANNEL[channel] ?? channel);

  /* A verdict outranks channel identity here. `flat` deliberately falls back
     to the channel tint rather than inventing a third colour -- no change is
     not a third kind of news. */
  const semantic = tone === 'good' ? 'var(--semantic-good)'
    : tone === 'bad' ? 'var(--semantic-bad)'
    : null;

  const fill = semantic ?? (channel === 'all'
    ? 'linear-gradient(to bottom, var(--accent-gradient-top), var(--accent-gradient-bottom))'
    : channelGradient(channel));
  const stroke = semantic ?? (key ? `var(--channel-${key})` : 'var(--accent-base)');

  if (metric && isRatio(metric)) {
    const d = norm.map((n, i) => {
      const x = (i / (norm.length - 1 || 1)) * width;
      const y = height - n * height;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    return (
      <svg className="gr-spark" width={width} height={height} aria-hidden="true">
        <path d={d} fill="none" stroke={stroke} strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <span className="gr-spark gr-spark--bars" style={{ width, height }} aria-hidden="true">
      {norm.map((n, i) => (
        <span
          key={i}
          className="gr-spark__bar"
          style={{ height: `${n * 100}%`, background: fill }}
        />
      ))}
    </span>
  );
}
