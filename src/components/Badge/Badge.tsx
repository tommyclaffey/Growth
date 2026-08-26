import './Badge.css';

export type BadgeTone = 'neutral' | 'good' | 'bad' | 'warn' | 'accent';

export interface BadgeProps { label: string; tone?: BadgeTone }

/**
 * Badge — 24 tall, same grid maths as Status pill.
 *
 * Unlike Status pill this DOES take a label, because a badge is a free
 * annotation rather than a state machine. That asymmetry is intentional.
 */
export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  return <span className={`gr-badge gr-badge--${tone} gr-type-caption-med`}>{label}</span>;
}
