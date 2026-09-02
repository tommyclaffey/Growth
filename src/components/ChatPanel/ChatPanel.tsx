import { useCallback, useEffect, useRef, useState } from 'react';
import './ChatPanel.css';
import {
  loadThread, postDirectToSlack, postToSlack, subscribeToSlack, type ChatSource,
} from '../../data/slackClient';
import { useAvatarFor } from '../../data/profile';
import { ConversationList } from '../ConversationList/ConversationList';
import {
  appendMessage, conversationName, getConversation, markRead, replaceMessages,
  memberOf, others, renameConversation, setMemberOverlay, sortedConversations, unreadCount,
} from '../../data/conversations';
import { SlackMark } from '../SlackMark/SlackMark';
import { listPeople, type Person } from '../../data/slackDirectory';
import { activeMention, applyMention, mentionsMe, toSlackMentions } from '../../data/mentions';
import { Button } from '../Button/Button';
import {
  ME, groupMessages, nowLabel,
  type Member, type Message, type ViewRef,
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
  const [pendingFail, setPendingFail] = useState<string | null>(null);
  const [source, setSource] = useState<ChatSource>('seed');
  const [origin, setOrigin] = useState<{ team?: string; channel?: string }>({});
  const [draft, setDraft] = useState('');
  const avatarFor = useAvatarFor();
  /* Two levels, list then thread. `null` IS the list — an explicit
     view: 'list' | 'thread' would be a second source of truth for the same
     fact, and they drift. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [tick, setTick] = useState(0);        /* conversations live outside React */
  /* The SLACK directory — used only to translate a name into the id Slack
     stores, and only for the one conversation Slack mirrors. It is not the
     roster the mention list is built from. */
  const [slackPeople, setSlackPeople] = useState<Person[]>([]);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const composerRef = useRef<HTMLInputElement>(null);

  /* Derived above the effects because one of them depends on messages.length.
     `tick` is read here so a mutation to the conversation store -- which lives
     outside React -- re-derives this. */
  void tick;
  const open = openId ? getConversation(openId) : undefined;
  const messages: Message[] = open?.messages ?? [];
  const mirrored = Boolean(open?.mirrorsSlack) && source === 'slack';

  /* The directory is needed to turn "@Dan Kwon" into the id Slack stores, so
     it is fetched once rather than per keystroke. */
  useEffect(() => { void listPeople().then(setSlackPeople); }, [source]);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const t = await loadThread();
    setMemberOverlay(t.members);
    setSource(t.source);
    setOrigin({ team: t.team, channel: t.channel });
    /* Slack is the authority for the ONE conversation it mirrors, and for
       nothing else. Writing its messages over whatever is open is what made
       the old panel show the linked channel no matter what you had chosen. */
    if (t.source === 'slack') {
      const mirrored = sortedConversations().find((c) => c.mirrorsSlack);
      if (mirrored) replaceMessages(mirrored.id, t.messages);
    }
    setTick((n) => n + 1);
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

  /* You can only mention someone who is in the conversation.
     This was built from the Slack workspace directory, so typing "@" in a
     Growth DM offered every account in a linked Slack -- people who are not
     in the thread, and in a personal workspace, not colleagues at all. A
     mention is a claim that someone will see it, and mentioning somebody who
     is not in the conversation is a claim the product cannot honour. */
  const roster: Member[] = open ? open.memberIds.map(memberOf).filter((m) => m.id !== ME.id) : [];
  const suggestions = mention
    ? roster.filter((m) => m.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6)
    : [];

  function choose(p: Member) {
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
    if (!openId || !open) return;
    const body = draft.trim();
    if (!body && !pending) return;
    const text = body || 'Sharing this view.';

    appendMessage(openId, {
      id: `local-${Date.now()}`,
      authorId: ME.id,
      body: text,
      time: nowLabel(),
      minutesAgo: 0,
      view: pending ?? undefined,
    });
    setDraft('');
    setTick((n) => n + 1);
    onClearPending();

    if (source !== 'slack') return;

    /* A DM goes to a Slack DM; the mirrored channel goes to the channel.

       This used to return early for anything that was not the mirrored
       conversation, on the grounds that posting a private message into a team
       channel is the worst thing this feature could do. That was true, and
       the conclusion was still wrong -- the answer is to use Slack's own DM
       conversation, not to deliver nothing. Slack had the right destination
       all along; it just was not being addressed. */
    if (!mirrored) {
      const recipients = open.memberIds.filter((id) => id !== ME.id);
      const { delivered, unreachable } = await postDirectToSlack(
        recipients, toSlackMentions(text, slackPeople), pending);
      /* Partial delivery is still a failure to be honest about: naming who did
         not receive it beats a silent success, which is what "message sent"
         would be for someone who never linked an account. */
      if (!delivered) {
        setPendingFail(recipients.length === unreachable.length
          ? 'No Slack account linked for anyone in this conversation. Saved here only.'
          : 'Not delivered to Slack. Saved here.');
      } else if (unreachable.length > 0) {
        const names = unreachable.map((id) => memberOf(id).name).join(', ');
        setPendingFail(`Sent, but ${names} has no linked Slack account.`);
      } else {
        setPendingFail(null);
      }
      return;
    }

    const sent = await postToSlack(toSlackMentions(text, slackPeople), pending);
    /* A message that exists only in this browser but looks identical to one
       that reached the channel is worse than an error -- the user believes
       their team saw it. */
    if (!sent) { setPendingFail(text); return; }
    setPendingFail(null);
    await refresh();
  }


  const groups = groupMessages(messages);

  return (
    <aside className="gr-chat" aria-label="Team chat">
      <header className={`gr-chat__header ${open ? "" : "is-list"}`}>
        <div className="gr-chat__head-row">
          {open && (
            <button type="button" className="gr-chat__back" onClick={() => setOpenId(null)}
                    aria-label="All conversations">‹</button>
          )}
          <div className="gr-chat__head-text">
            {open ? (
              renaming ? (
                /* Rename in place. A modal to type one word is a modal too
                   many, and the header is where the name already is. */
                <input
                  className="gr-chat__rename gr-type-section"
                  defaultValue={open.title ?? ''}
                  placeholder={conversationName(open)}
                  autoFocus
                  onBlur={(e) => { renameConversation(open.id, e.target.value); setRenaming(false); setTick((n) => n + 1); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') { setRenaming(false); }
                  }}
                />
              ) : (
                /* The name IS the switcher. A separate "switch" control would
                   sit beside a label naming the exact thing it switches. */
                <button type="button" className="gr-chat__switch" onClick={() => setOpenId(null)}>
                  <span className="gr-type-section">{conversationName(open)}</span>
                  <span aria-hidden="true"> ⌄</span>
                </button>
              )
            ) : (
              <h2 className="gr-type-section">Messages</h2>
            )}
            {open ? (
              <p className="gr-type-caption">
                {open.kind === 'channel'
                  ? `${open.memberIds.length} people`
                  : others(open).map((m) => m.name).join(', ')}
                {mirrored && origin.channel ? ` · mirrored to #${origin.channel}` : ''}
                {' · '}
                <button type="button" className="gr-chat__rename-cta" onClick={() => setRenaming(true)}>
                  {open.title ? 'Rename' : 'Name it'}
                </button>
              </p>
            ) : (
              <p className="gr-type-caption">
                {(() => {
                  const n = sortedConversations().reduce((a, c) => a + unreadCount(c), 0);
                  return n ? `${n} unread` : 'All caught up';
                })()}
              </p>
            )}
          </div>
          <button type="button" className="gr-chat__close" onClick={onClose} aria-label="Close chat">✕</button>
        </div>
        {/* Connecting a Slack workspace moved to Settings. It is a setup task
            done once, and it was sitting permanently in a panel used every
            day — "+ Add workspace" is not something you reach for while
            reading a message. */}
      </header>

      {!open && (
        <ConversationList
          currentId={openId}
          slackChannel={source === 'slack' ? origin.channel : undefined}
          onOpen={(id) => { markRead(id); setOpenId(id); setTick((n) => n + 1); }}
        />
      )}

      {open && <><div className="gr-chat__messages">
        {groups.map((group, gi) => {
          const author = memberOf(group[0].authorId);
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
                  <Avatar initials={p.initials} hue={p.hue} size={24} name={p.name} src={avatarFor(p)} />
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
            placeholder={pending ? 'Add a comment…'
              : open ? `Message ${conversationName(open)}` : 'Message'}
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
        {/* Named where it happened. A failed post used to be appended to the
            message body as "(not delivered)", which edits what the person
            wrote in order to report a delivery fact. */}
        {pendingFail && (
          <p className="gr-chat__failed gr-type-caption" role="alert">
            Not delivered to Slack. It is saved here.
          </p>
        )}
      </div></>}
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
