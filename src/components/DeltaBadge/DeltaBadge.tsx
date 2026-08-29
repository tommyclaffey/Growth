import './DeltaBadge.css';

export interface DeltaBadgeProps {
  /** e.g. 22 for +22%. Sign drives the arrow and the colour. */
  percent: number;
  /**
   * For CAC, up is bad. The badge cannot know that from the number alone, so
   * the caller says which direction is good. Getting this wrong is how a
   * dashboard ends up colouring a rising cost green.
   */
  higherIsBetter?: boolean;
}

export function DeltaBadge({ percent, higherIsBetter = true }: DeltaBadgeProps) {
  const up = percent >= 0;
  const good = up === higherIsBetter;
  return (
    <span className={`gr-delta gr-type-caption-med ${good ? 'is-good' : 'is-bad'}`}>
      <span aria-hidden="true">{up ? '↑' : '↓'}</span>
      {Math.abs(percent)}%
      <span className="gr-sr-only">{up ? 'increase' : 'decrease'}</span>
    </span>
  );
}
