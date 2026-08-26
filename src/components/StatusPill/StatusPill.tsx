import './StatusPill.css';

export type Stage = 'Active' | 'Paused' | 'Draft' | 'Ended' | 'Review';

export interface StatusPillProps { stage: Stage }

/**
 * Status pill — 24 tall: space/4 + 16 + space/4, radius/sm, 12/16 Medium.
 *
 * Deliberately has NO label text property, unlike Badge. The stage IS the
 * label. Exposing text would let a Paused pill render the word "Active",
 * which is a lie the component would be helping to tell.
 */
export function StatusPill({ stage }: StatusPillProps) {
  return (
    <span className={`gr-status gr-status--${stage.toLowerCase()} gr-type-caption-med`}>
      <span className="gr-status__dot" aria-hidden="true" />
      {stage}
    </span>
  );
}
