import { useCallback, useEffect, useRef, useState } from 'react';
import './ChatPanel.css';
import { loadThread, postToSlack, subscribeToSlack, type ChatSource } from '../../data/slackClient';
import { SlackConnect } from './SlackConnect';
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
import { CSS_CHANNEL } from '../../styles/tokens';


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
  const [members, setMembers] = useState(MEMBERS);
  const [source, setSource] = useState<ChatSource>('seed');
  const [origin, setOrigin] = useState<{ team?: string; channel?: string }>({});
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const t = await loadThread();
    setMessages(t.messages);
    setMembers(t.members);
    setSource(t.source);
    setOrigin({ team: t.team, channel: t.channel });
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  /* Slack sends the browser back here after consent. Clear the marker so a
     reload does not look like a fresh connection. */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('slack') === 'connected') {
      window.history.replaceState({}, '', window.location.pathname);
      void refresh();
    }
  }, [refresh]);

  /* Push, with polling underneath it.
     Slack posts to /api/slack/events the moment a message lands, and that is
     relayed here over SSE — so updates are immediate. The slow poll stays as a
     floor: a stream can be connected and still miss an event (a dropped
     delivery, a buffering proxy, a reconnect gap), and a chat that is silently
     stale is worse than one that is a few seconds behind. */
  useEffect(() => {
    if (source !== 'slack') return;
    const unsubscribe = subscribeToSlack(() => { void refresh(); });
    const id = setInterval(() => { void refresh(); }, 30000);
    return () => { unsubscribe(); clearInterval(id); };
  }, [source, refresh]);

  // Follow the conversation as it grows, the way every chat client does.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  // A newly staged view should be visible without scrolling for it.
  useEffect(() => {
    if (pending) endRef.current?.scrollIntoView({ block: 'end' });
  }, [pending]);

  async function send() {
    const body = draft.trim();
    if (!body && !pending) return;
    const text = body || 'Sharing this view.';

    /* Optimistic: the message appears immediately, then reconciles with what
       Slack actually stored. */
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${prev.length}`,
        authorId: ME.id,
        body: text,
        time: nowLabel(),
        minutesAgo: 0,
        view: pending ?? undefined,
      },
    ]);
    setDraft('');
    onClearPending();

    if (source === 'slack') {
      const sent = await postToSlack(text, pending);
      /* If it did not land, say so. A message that exists only in this browser
         but looks identical to one that reached the channel is worse than an
         error — the user believes their team saw it. */
      if (!sent) {
        setMessages((prev) => prev.map((m) =>
          m.id === `local-${prev.length - 1}` ? { ...m, body: `${m.body}  (not delivered)` } : m));
        return;
      }
      await refresh();
    }
  }

  const groups = groupMessages(messages);

  return (
    <aside className="gr-chat" aria-label="Team chat">
      <header className="gr-chat__header">
        <div className="gr-chat__head-row">
          <div className="gr-chat__head-text">
            <h2 className="gr-type-section">Team chat</h2>
            {/* Was hard-coded to the seeded channel, so a connected panel still
                claimed to be reading #growth-analytics with 4 members. It now
                says what it is actually reading. */}
            <p className="gr-type-caption">
              {source === 'slack' && origin.channel
                ? `#${origin.channel}${origin.team ? ` · ${origin.team}` : ''}`
                : 'Demo conversation · not connected'}
            </p>
          </div>
          <button type="button" className="gr-chat__close" onClick={onClose} aria-label="Close chat">✕</button>
        </div>
        {/* Which workspace this is reading belongs with the channel name, not
            in the message stream. It also fills a header sized to match the
            app header, which two lines of text left half empty. */}
        <SlackConnect onConnected={() => { void refresh(); }} />
      </header>

      <div className="gr-chat__messages">
        {groups.map((group, gi) => {
          const author = members[group[0].authorId] ?? ME;
          const mine = author.id === ME.id;
          return (
            <article key={gi} className={`gr-msg ${mine ? 'is-mine' : ''}`}>
              <Avatar initials={author.initials} hue={author.hue} name={author.name} />
              <div className="gr-msg__body">
                <p className="gr-msg__meta gr-type-caption">
                  <strong>{author.name}</strong>
                  <span>{group[0].time}</span>
                  {group.some((m) => m.fromSlack) && <SlackMark />}
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


/**
 * Slack's lockup — mark plus wordmark, in a pill.
 *
 * The mark alone was tried first and rejected on sight: at 12px it reads as a
 * coloured pinwheel, and a badge nobody recognises is not a badge. The wordmark
 * is what makes it legible, so it stays.
 *
 * Slack's colours and the lowercase wordmark are reproduced as Slack ships
 * them. Brand artwork is externally owned — the same reason TikTok's pink is
 * not a token in this system.
 */
function SlackMark() {
  return (
    <span className="gr-msg__slack" title="Sent from Slack">
      <svg width="11" height="11" viewBox="0 0 122.8 122.8" aria-hidden="true">
        <path d="M25.8 77.6a12.9 12.9 0 1 1-12.9-12.9h12.9v12.9zm6.5 0a12.9 12.9 0 0 1 25.8 0v32.3a12.9 12.9 0 0 1-25.8 0V77.6z" fill="#E01E5A" />
        <path d="M45.2 25.8a12.9 12.9 0 1 1 12.9-12.9v12.9H45.2zm0 6.5a12.9 12.9 0 0 1 0 25.8H12.9a12.9 12.9 0 0 1 0-25.8h32.3z" fill="#36C5F0" />
        <path d="M97 45.2a12.9 12.9 0 1 1 12.9 12.9H97V45.2zm-6.5 0a12.9 12.9 0 0 1-25.8 0V12.9a12.9 12.9 0 0 1 25.8 0v32.3z" fill="#2EB67D" />
        <path d="M77.6 97a12.9 12.9 0 1 1-12.9 12.9V97h12.9zm0-6.5a12.9 12.9 0 0 1 0-25.8h32.3a12.9 12.9 0 0 1 0 25.8H77.6z" fill="#ECB22E" />
      </svg>
      <span className="gr-msg__slack-word">slack</span>
      <span className="gr-sr-only">Sent from Slack</span>
    </span>
  );
}

