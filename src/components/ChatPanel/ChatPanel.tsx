import { useCallback, useEffect, useRef, useState } from 'react';
import './ChatPanel.css';
import { loadThread, postToSlack, subscribeToSlack, type ChatSource } from '../../data/slackClient';
import { useAvatarFor } from '../../data/profile';
import { SlackConnect } from './SlackConnect';
import { ConversationPicker } from '../ConversationPicker/ConversationPicker';
import { SlackMark } from '../SlackMark/SlackMark';
import { listPeople, type Person } from '../../data/slackDirectory';
import { activeMention, applyMention, mentionsMe, toSlackMentions } from '../../data/mentions';
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
  const avatarFor = useAvatarFor();
  const [picking, setPicking] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const composerRef = useRef<HTMLInputElement>(null);

  /* The directory is needed to turn "@Dan Kwon" into the id Slack stores, so
     it is fetched once rather than per keystroke. */
  useEffect(() => { void listPeople().then(setPeople); }, [source]);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const t = await loadThread();
    setMessages(t.messages);
    setMembers(t.members);
    setSource(t.source);
    setOrigin({ team: t.team, channel: t.channel });
    setConversationId(t.channelId ?? null);
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

  const suggestions = mention
    ? people.filter((p) => p.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6)
    : [];

  function choose(p: Person) {
    const el = composerRef.current;
    if (!el || !mention) return;
    const next = applyMention(draft, mention.start, el.selectionStart ?? draft.length, p.name);
    setDraft(next.text);
    setMention(null);
    /* Caret has to be restored after React re-renders the value, or it jumps
       to the end and the next character lands in the wrong place. */
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  }

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
      /* Slack stores an id, not a name — a renamed person's old messages still
         read correctly because of it. */
      const sent = await postToSlack(toSlackMentions(text, people), pending);
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
            {source === 'slack' && origin.channel ? (
              /* The conversation name is the control that changes it — a
                 separate "switch" button would sit beside a label naming the
                 exact thing it switches. */
              <button type="button" className="gr-chat__switch gr-type-caption"
                      onClick={() => setPicking((v) => !v)}>
                {origin.channel}{origin.team ? ` · ${origin.team}` : ''}
                <span aria-hidden="true"> ⌄</span>
              </button>
            ) : (
              <p className="gr-type-caption">Demo conversation · not connected</p>
            )}
          </div>
          <button type="button" className="gr-chat__close" onClick={onClose} aria-label="Close chat">✕</button>
        </div>
        {/* Which workspace this is reading belongs with the channel name, not
            in the message stream. It also fills a header sized to match the
            app header, which two lines of text left half empty. */}
        <SlackConnect onConnected={() => { void refresh(); }} />
      </header>

      {picking && (
        <div className="gr-chat__picker">
          <ConversationPicker
            currentId={conversationId}
            onClose={() => setPicking(false)}
            onOpened={() => { setPicking(false); void refresh(); }}
          />
        </div>
      )}

      <div className="gr-chat__messages">
        {groups.map((group, gi) => {
          const author = members[group[0].authorId] ?? ME;
          const mine = author.id === ME.id;
          return (
            <article key={gi} className={`gr-msg ${mine ? 'is-mine' : ''}`}>
              <Avatar initials={author.initials} hue={author.hue} name={author.name} src={avatarFor(author)} />
              <div className="gr-msg__body">
                <p className="gr-msg__meta gr-type-caption">
                  <strong>{author.name}</strong>
                  <span>{group[0].time}</span>
                  {group.some((m) => m.fromSlack) && (
                    <span className="gr-msg__slack" title="Sent from Slack">
                      <SlackMark size={11} />
                      <span className="gr-msg__slack-word">slack</span>
                      <span className="gr-sr-only">Sent from Slack</span>
                    </span>
                  )}
                </p>
                {group.map((m) => (
                  <div key={m.id} className={`gr-msg__line ${mentionsMe(m.body) ? 'is-flagged' : ''}`}>
                    <p className="gr-type-body">{renderBody(m.body)}</p>
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
        {suggestions.length > 0 && (
          <ul className="gr-mention" role="listbox" aria-label="People">
            {suggestions.map((p) => (
              <li key={p.id}>
                <button type="button" className="gr-mention__row gr-type-body"
                        /* onMouseDown, not onClick: click fires after blur, and
                           the input losing focus first closes this list. */
                        onMouseDown={(e) => { e.preventDefault(); choose(p); }}>
                  <Avatar initials={p.initials} hue={p.hue} size={24} src={p.avatar} />
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="gr-chat__row">
          <input
            ref={composerRef}
            className="gr-chat__input gr-type-body"
            placeholder={pending
              ? 'Add a comment…'
              : origin.channel ? `Message ${origin.channel}` : 'Message'}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setMention(activeMention(e.target.value, e.target.selectionStart ?? e.target.value.length));
            }}
            onBlur={() => setMention(null)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') return setMention(null);
              /* Enter picks the top suggestion while the list is open, rather
                 than sending a half-typed name. */
              if (e.key === 'Enter' && suggestions.length > 0) {
                e.preventDefault();
                return choose(suggestions[0]);
              }
              if (e.key === 'Enter') send();
            }}
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






/** Draws @names as marks rather than plain text, so a mention is findable. */
function renderBody(body: string) {
  const parts = body.split(/(@[\p{L}][\p{L}\p{N}. '-]*)/gu);
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} className={`gr-mention__tag ${mentionsMe(part) ? 'is-me' : ''}`}>{part.trimEnd()}</span>
      : part,
  );
}
