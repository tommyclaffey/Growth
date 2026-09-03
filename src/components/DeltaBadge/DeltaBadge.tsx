import './DeltaBadge.css';
import { deltaTone } from '../../data/metrics';

export interface DeltaBadgeProps {
  /** e.g. 22 for +22%. Sign drives the arrow and the colour. */
  percent: number;
  /**
   * For CAC, up is bad. The badge cannot know that from the number alone, so
   * the caller says which direction is good. Getting this wrong is how a
   * dashboard ends up colouring a rising cost green.
   */
  higherIsBetter?: boolean;
  /**
   * Drops the pill surface, leaving coloured text.
   *
   * A variant exists so the table can reuse this rather than redraw it. The
   * table previously carried its own copy — same arrow, same colours, its own
   * `>= 0` test and no `higherIsBetter` at all — which is how the KPI cards
   * came to show a flat 0% while the table two inches below showed the same
   * 0% as a green rise.
   */
  bare?: boolean;
}

export function DeltaBadge({ percent, higherIsBetter = true, bare = false }: DeltaBadgeProps) {
  /* Zero is not a direction.
     `percent >= 0` folded 0 in with "up", so an unchanged metric got an arrow
     and a verdict: blended CAC rendered "up 0%" in red while blended ROAS
     rendered "up 0%" in green, on the same screen, both describing nothing
     happening. Flat is its own state and reads as flat. */
  const tone = deltaTone(percent, higherIsBetter);
  if (tone === 'flat') {
    return (
      <span className={`gr-delta gr-type-caption-med is-flat ${bare ? "is-bare" : ""}`}>
        <span aria-hidden="true">–</span>
        0%
        <span className="gr-sr-only">no change</span>
      </span>
    );
  }

  const up = percent > 0;
  return (
    <span className={`gr-delta gr-type-caption-med ${tone === 'good' ? 'is-good' : 'is-bad'} ${bare ? 'is-bare' : ''}`}>
      <span aria-hidden="true">{up ? '↑' : '↓'}</span>
      {Math.abs(percent)}%
      <span className="gr-sr-only">{up ? 'increase' : 'decrease'}</span>
    </span>
  );
}
