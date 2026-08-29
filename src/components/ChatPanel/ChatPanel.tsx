import { useEffect, useRef, useState } from 'react';
import './ChatPanel.css';
import { Button } from '../Button/Button';
import {
  MEMBERS, ME, SEED, groupMessages, nowLabel,
  type Message, type ViewRef,
} from '../../data/chat';
import {
  CHANNEL_LABEL, RANGE_LABEL, delta, formatMetric, isRatio, totals, type Scope,
} from '../../data/metrics';
import { DeltaBadge } from '../DeltaBadge/DeltaBadge';
import { Avatar } from '../Avatar/Avatar';
import type { ChannelName } from '../../styles/tokens';

const CSS_CHANNEL: Record<string, string> = {
  meta: 'meta', tiktok: 'tiktok', youtube: 'youtube',
  affiliates: 'affiliates', paidSearch: 'paid-search', podcasts: 'podcasts',
};

export interface ChatPanelProps {
  onClose: () => void;
  /**
   * A view staged for sending, set by clicking a KPI card on the dashboard.
   * The composer does not offer an attach button — you attach a metric by
   * clicking the metric, which is the only place you are already looking at
   * the number you want to talk about.
   */
  pending: ViewRef | null;
  onClearPending: () => void;
}

/**
 * Team chat.
 *
 * The thing that makes this chat rather than a generic messaging UI is the
 * view card: a teammate can drop the exact channel, metric and range they
 * are looking at into the thread, and it unfurls with the live number.
 * "Meta CAC is up" and a screenshot of Meta CAC are different artifacts —
 * one goes stale the moment the data moves, the other does not.
 */
export function ChatPanel({ onClose, pending, onClearPending }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>(SEED);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // Follow the conversation as it grows, the way every chat client does.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  // A newly staged view should be visible without scrolling for it.
  useEffect(() => {
    if (pending) endRef.current?.scrollIntoView({ block: 'end' });
  }, [pending]);

  function send() {
    const body = draft.trim();
    if (!body && !pending) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${prev.length}`,
        authorId: ME.id,
        body: body || 'Sharing this view.',
        time: nowLabel(),
        minutesAgo: 0,
        view: pending ?? undefined,
      },
    ]);
    setDraft('');
    onClearPending();
  }

  const groups = groupMessages(messages);

  return (
    <aside className="gr-chat" aria-label="Team chat">
      <header className="gr-chat__header">
        <div>
          <h2 className="gr-type-section">Team chat</h2>
          <p className="gr-type-caption">#growth-analytics · 4 members</p>
        </div>
        <button type="button" className="gr-chat__close" onClick={onClose} aria-label="Close chat">✕</button>
      </header>

      <div className="gr-chat__messages">
        {groups.map((group, gi) => {
          const author = MEMBERS[group[0].authorId] ?? ME;
          const mine = author.id === ME.id;
          return (
            <article key={gi} className={`gr-msg ${mine ? 'is-mine' : ''}`}>
              <Avatar initials={author.initials} hue={author.hue} name={author.name} />
              <div className="gr-msg__body">
                <p className="gr-msg__meta gr-type-caption">
                  <strong>{author.name}</strong>
                  <span>{group[0].time}</span>
                  {group.some((m) => m.fromSlack) && (
                    <span className="gr-msg__slack gr-type-micro">
                      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                        <circle cx="3" cy="3" r="1.4" fill="currentColor" />
                        <circle cx="7" cy="3" r="1.4" fill="currentColor" />
                        <circle cx="3" cy="7" r="1.4" fill="currentColor" />
                        <circle cx="7" cy="7" r="1.4" fill="currentColor" />
                      </svg>
                      Slack
                    </span>
                  )}
                </p>
                {group.map((m) => (
                  <div key={m.id} className="gr-msg__line">
                    <p className="gr-type-body">{m.body}</p>
                    {m.view && <ViewCard view={m.view} />}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="gr-chat__composer">
        {pending && (
          <div className="gr-chat__attachment">
            <ViewCard view={pending} compact />
            <button type="button" className="gr-chat__unattach" onClick={onClearPending}
                    aria-label="Remove attached metric">✕</button>
          </div>
        )}
        <div className="gr-chat__row">
          <input
            className="gr-chat__input gr-type-body"
            placeholder={pending ? 'Add a comment…' : 'Message #growth-analytics'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          />
          <Button variant="primary" onClick={send}>Send</Button>
        </div>
      </div>
    </aside>
  );
}

/**
 * A shared view, unfurled with its live number rather than a stale screenshot.
 *
 * Carries the same three things the KPI card does — value, change, and what
 * period it is "as of" — because a number in a thread without a date is the
 * thing people argue about three weeks later.
 */
function ViewCard({ view, compact = false }: { view: ViewRef; compact?: boolean }) {
  const scope = view.channel as Scope;
  const t = totals(scope, view.range);

  const value =
    view.metric === 'Spend' ? formatMetric('Spend', t.spend)
    : view.metric === 'Leads' ? formatMetric('Leads', t.leads)
    : view.metric === 'CAC' ? formatMetric('CAC', t.cac)
    : view.metric === 'ROAS' ? formatMetric('ROAS', t.roas)
    : view.metric === 'Sales' ? formatMetric('Sales', t.sales)
    : formatMetric('Clicks', t.clicks);

  const change = delta(scope, view.metric, view.range);

  // Rising CAC is bad; rising everything else here is good.
  const higherIsBetter = view.metric !== 'CAC';

  const label = view.channel === 'all' ? 'All channels' : CHANNEL_LABEL[view.channel as ChannelName];
  const dot = view.channel === 'all'
    ? 'var(--accent-base)'
    : `var(--channel-${CSS_CHANNEL[view.channel]})`;

  return (
    <div className={`gr-viewcard ${compact ? 'is-compact' : ''}`}>
      <p className="gr-viewcard__head gr-type-caption">
        <span className="gr-viewcard__dot" style={{ background: dot }} aria-hidden="true" />
        {label} · {RANGE_LABEL[view.range]}
      </p>
      <p className="gr-viewcard__metric gr-type-body">{view.metric}</p>
      <p className="gr-viewcard__row">
        <span className="gr-viewcard__value gr-type-kpi-value">{value}</span>
        <DeltaBadge percent={change} higherIsBetter={higherIsBetter} />
      </p>
      {isRatio(view.metric) && (
        <p className="gr-viewcard__note gr-type-micro">
          Ratio — computed from the period, not summed
        </p>
      )}
    </div>
  );
}
