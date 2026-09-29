import './Scorecard.css';
import { grade, type GradeStatus } from '../../data/grading';
import { setOutcome, type Flag } from '../../data/attention';

const LABEL: Record<GradeStatus, string> = {
  pending: 'Pending',
  met: 'Worked',
  missed: 'Missed',
  'no-data': 'No new data',
  done: 'Done',
  waiting: 'Not yet',
  worked: 'Worked',
  didnt: 'Didn’t work',
  ungraded: 'Not graded',
};

const TONE: Record<GradeStatus, 'good' | 'bad' | 'neutral'> = {
  pending: 'neutral', met: 'good', missed: 'bad', 'no-data': 'neutral',
  done: 'good', waiting: 'neutral', worked: 'good', didnt: 'bad', ungraded: 'neutral',
};

/**
 * Did the decision work? One line on every decided card.
 *
 * Graded from the baseline captured when it was taken (see grading.ts). Where
 * no number can answer, the person answers -- and can change their mind.
 */
export function Scorecard({ flag, today }: { flag: Flag; today?: Date }) {
  const g = grade(flag, today);
  const manual = !flag.baseline || flag.outcome !== undefined;

  return (
    <div className="gr-score" data-status={g.status}>
      <span className={`gr-score__pill gr-type-caption-med tone-${TONE[g.status]}`}>{LABEL[g.status]}</span>
      <span className="gr-type-caption gr-score__text">{g.text}</span>
      {manual && (
        <span className="gr-score__manual gr-type-caption">
          {flag.outcome ? (
            <button type="button" className="gr-unbutton gr-score__undo"
                    onClick={() => setOutcome('decision', flag.refId, null)}>
              Change
            </button>
          ) : (
            <>
              <button type="button" className="gr-score__btn gr-type-caption-med"
                      onClick={() => setOutcome('decision', flag.refId, 'worked')}>Worked</button>
              <button type="button" className="gr-score__btn gr-type-caption-med"
                      onClick={() => setOutcome('decision', flag.refId, 'didnt')}>Didn’t work</button>
            </>
          )}
        </span>
      )}
    </div>
  );
}
