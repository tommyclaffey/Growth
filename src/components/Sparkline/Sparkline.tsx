import { useId } from 'react';
import './Sparkline.css';
import { CSS_CHANNEL, channelGradient, type ChannelName } from '../../styles/tokens';
import { smoothPath } from '../Chart/smoothPath';


export interface SparklineProps {
  /** Raw values. Scaling happens here so callers cannot each invent their own. */
  values: number[];
  /** Tints to the channel, matching the chart it summarises. */
  channel?: ChannelName | 'all';
  /**
   * Bars in KPI cards, a line in table rows. A row is read across, and a
   * column of six bar clusters stacked down a table reads as a second
   * chart competing with the numbers; a line reads as a direction.
   */
  variant?: 'bars' | 'line';
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
 * The mark is a PROP, not a decision this component makes -- because the two
 * places it appears answer the question differently, and both are right.
 *
 * In a KPI card it follows the metric, via `trendMark`: a count accumulates so
 * a bar per day is honest, a rate does not so it gets a line. Same rule Chart
 * follows, one definition shared.
 *
 * In a table row it is ALWAYS a line, whatever the metric. The row already
 * carries a share-of-spend bar, and a bar cluster beside a bar gauge reads as
 * two competing charts rather than a number and its direction. Placement wins
 * there; the metric wins in a card. Passing the mark in is what lets both be
 * true without this component knowing where it is.
 *
 * Bars are scaled from the series minimum, not from zero, and keep a 15%
 * floor so a low point stays visible as a mark rather than vanishing. At this
 * size the shape is the message; the axis is not readable regardless.
 */
export function Sparkline({
  values,
  channel = 'all',
  variant = 'bars',
  width = 56,
  height = 14,
}: SparklineProps) {
  /* A unique gradient id per instance. Keyed on the channel alone, two lines
     for the same channel on one page would share -- and fight over -- one id. */
  const uid = useId();
  if (values.length === 0) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const norm = values.map((v) => 0.15 + ((v - min) / span) * 0.85);

  /* The mark always wears the channel, never the verdict.

     Tinting it green/red was tried and reverted: the delta pill already states
     whether the news is good, and repeating that in the mark spent the one
     encoding that carries WHICH channel this is on a second copy of something
     already said an inch to the left. The pill answers "is this good"; the
     mark answers "which channel". Two questions, two encodings. */
  const fill = channel === 'all'
    ? 'linear-gradient(to bottom, var(--accent-gradient-top), var(--accent-gradient-bottom))'
    : channelGradient(channel);

  if (variant === 'line') {
    /* Inset by the stroke so the round caps and the end dot are not clipped
       at the edges of the box. Smoothed with the same monotone curve as the
       chart overlay, which never overshoots a real value. */
    const pad = 2;
    const pts = norm.map((n, i) => ({
      x: pad + (i / (norm.length - 1 || 1)) * (width - pad * 2),
      y: pad + (1 - n) * (height - pad * 2),
    }));
    const line = smoothPath(pts);
    const last = pts[pts.length - 1];
    const key = channel === 'all' ? null : (CSS_CHANNEL[channel] ?? channel);
    const stroke = key ? `var(--channel-${key})` : 'var(--accent-base)';
    const gid = `spark${uid.replace(/:/g, '')}`;
    return (
      <svg className="gr-spark gr-spark--line" width={width} height={height}
           viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L ${last.x} ${height} L ${pts[0].x} ${height} Z`} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={stroke} strokeWidth="1.75"
              strokeLinecap="round" strokeLinejoin="round" />
        {/* The end dot marks "now" -- the value the row's numbers describe. */}
        <circle cx={last.x} cy={last.y} r="2" fill={stroke} />
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
