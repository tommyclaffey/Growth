import { useRef } from 'react';
import './WelcomeCard.css';
import { Button } from '../Button/Button';
import { useOverlay } from '../../data/useOverlay';
import { closeWelcome, useWelcomeOpen } from '../../data/welcome';

export interface WelcomeCardProps {
  onDecisions: () => void;
  onAsk: () => void;
  onChannels: () => void;
  onTeam: () => void;
}

/**
 * The demo's front door (Oct 9) -- Queue's welcome card, in Growth's own voice.
 *
 * What Growth is, who you are in it, and four things worth trying, each one
 * a button that takes you there. Once per browser; the DEMO pill brings it
 * back. Sibling, not copy: Growth's violet and type scale, not Queue's lime,
 * and its own four steps -- the decision engine first, because that is the
 * part no other dashboard has.
 */
export function WelcomeCard({ onDecisions, onAsk, onChannels, onTeam }: WelcomeCardProps) {
  const open = useWelcomeOpen();
  const card = useRef<HTMLDivElement>(null);
  useOverlay(open, card, closeWelcome);
  if (!open) return null;

  const go = (fn: () => void) => () => { closeWelcome(); fn(); };
  const steps: { title: string; body: string; run: () => void }[] = [
    { title: 'Review the decisions', body: 'The moves worth making this week, how sure Growth is of each, and what each would change', run: onDecisions },
    { title: 'Ask AI', body: 'Ask anything about the numbers. Every answer comes from this dashboard, with its sources', run: onAsk },
    { title: 'Drill down to a single ad', body: 'From six channels to one campaign, one ad set, one ad, and see what is working', run: onChannels },
    { title: 'Meet the team', body: 'Assign a decision, send a report, or open the team chat with Jess, Dan and Amara', run: onTeam },
  ];

  return (
    <div className="gr-welcome__scrim" onClick={closeWelcome}>
      <div ref={card} className="gr-welcome" role="dialog" aria-modal="true" aria-labelledby="gr-welcome-title"
           onClick={(e) => e.stopPropagation()}>
        <span className="gr-welcome__pill gr-type-micro">Live demo</span>
        <h2 id="gr-welcome-title" className="gr-welcome__title gr-type-page-title">Welcome to Growth</h2>
        <p className="gr-welcome__lede gr-type-card-heading">
          A marketing dashboard that tells you what to do next. Growth reads spend and results across
          every channel, finds the moves worth making, and says how sure it is.
        </p>
        <p className="gr-welcome__persona gr-type-body">
          You&rsquo;re Maya Okonkwo, Growth lead at Northbank, with a team of six. Everyone here is
          made up, and nothing touches a real ad account.
        </p>
        <p className="gr-welcome__label gr-type-micro">Try these</p>
        <ol className="gr-welcome__steps">
          {steps.map((s, i) => (
            <li key={s.title}>
              <button type="button" className="gr-welcome__step" onClick={go(s.run)}>
                <span className="gr-welcome__num gr-type-body-medium" aria-hidden="true">{i + 1}</span>
                <span className="gr-welcome__text">
                  <strong className="gr-type-body-medium">{s.title}</strong>
                  <span className="gr-type-caption">{s.body}</span>
                </span>
                <svg className="gr-welcome__chev" width="8" height="12" viewBox="0 0 8 12" aria-hidden="true">
                  <path d="M1.5 1.5 6 6l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </li>
          ))}
        </ol>
        <div className="gr-welcome__foot">
          <span className="gr-type-caption gr-welcome__credit">
            Designed and engineered by <a href="https://www.tommyclaffey.com" target="_blank" rel="noopener noreferrer">Tommy Claffey</a>
          </span>
          <Button variant="primary" onClick={closeWelcome} autoFocus>Start exploring</Button>
        </div>
      </div>
    </div>
  );
}
