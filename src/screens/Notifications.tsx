import { useState } from 'react';
import { markAllRead, markRead, markUnread, usePrefs } from '../data/prefs';
import { toggleFlag, useFlags } from '../data/attention';
import { useChannels } from '../data/channels';
import { useCampaignStatus } from '../data/campaignStatus';
import {
  NOTE_GROUPS, notifications, weekLabels, weekSentence, type Note, type NoteTone,
} from '../data/notifications';
import type { Target } from '../data/decisions';
import { decisionEvents } from '../data/decisionEvents';
import { CHANNEL_LABEL, LAST_WEEK, higherIsBetter, windowEnd, type Metric, type Range } from '../data/metrics';
import './screens.css';
import { Button } from '../components/Button/Button';
import { Badge } from '../components/Badge/Badge';
import { Chip } from '../components/Chip/Chip';
import { ChannelMark } from '../components/ChannelMark/ChannelMark';
import { DeltaBadge } from '../components/DeltaBadge/DeltaBadge';
import { Sparkline } from '../components/Sparkline/Sparkline';

export interface NotificationsProps {
  /**
   * Opens the item an alert is about -- the same route a decision uses.
   *
   * ⚠️ With the VIEW the alert describes. "Meta CAC rose 42% week over week"
   * opened onto the 30-day screen showed +9%: the right channel, a different
   * number, and no way to tell why. A weekly alert opens at 7 days on its metric.
   */
  onOpen?: (target: Target, view?: NoteView) => void;
  /** A decision event opens the queue it lives in. */
  onOpenDecisions?: () => void;
  /** Starts a conversation about it, scoped to its subject -- at the same view. */
  onAsk?: (question: string, subject?: Target, view?: NoteView) => void;
}

export interface NoteView { metric?: Metric; range?: Range }

const FILTER_LABEL: Record<NoteTone, string> = { bad: 'Issues', warn: 'Watch', good: 'Wins' };

/** What each section of the feed MEANS, in one line under its heading. */
const GROUP_NOTE: Record<string, string> = {
  'Your decisions': 'What happened to what you committed to.',
  'This week': 'Moved past your threshold against the week before.',
  Standing: 'True all month — not new, but not resolved.',
  'Waiting on someone': 'Nothing changes here until a person acts.',
};

/**
 * The notification feed.
 *
 * ⭐ Every row is computed (see `notifications()`), links to the thing it is
 * about, and shows the evidence beside the sentence: the two weeks it compares,
 * drawn, and the change as a number. A notification you have to click through
 * to believe is one you learn to ignore.
 */
export function Notifications({ onOpen, onAsk, onOpenDecisions }: NotificationsProps) {
  const [filter, setFilter] = useState<NoteTone | 'flagged' | null>(null);
  const channels = useChannels();
  /* Subscribed so approving a campaign in Review clears its row here. */
  useCampaignStatus();
  /* The numbers' events and the team's -- one feed. */
  useFlags();
  const notes = [...decisionEvents(), ...notifications(channels)];

  /* Persisted, so a read row stays read after navigating away. */
  const { readAlerts } = usePrefs();
  const read = new Set(readAlerts);
  const flaggedIds = new Set(useFlags()
    .filter((f) => f.kind === 'notification')
    .map((f) => f.refId));

  const shown = filter === null ? notes
    : filter === 'flagged' ? notes.filter((n) => flaggedIds.has(n.id))
    : notes.filter((n) => n.tone === filter);
  const unread = notes.filter((n) => !read.has(n.id));
  const count = (t: NoteTone) => notes.filter((n) => n.tone === t).length;

  return (
    <>
      <header className="gr-section-head gr-note-head">
        <Badge
          label={unread.length > 0 ? `${unread.length} unread` : 'All caught up'}
          tone={unread.length > 0 ? 'accent' : 'neutral'}
        />
        <span className="gr-type-caption gr-note-head__window">
          {weekSentence()}
        </span>
        <span className="gr-spacer" />
        <Chip label={`All ${notes.length}`} pressed={filter === null} onClick={() => setFilter(null)} />
        {(['bad', 'warn', 'good'] as NoteTone[]).filter((t) => count(t) > 0).map((t) => (
          <Chip key={t} label={`${FILTER_LABEL[t]} ${count(t)}`} pressed={filter === t}
                onClick={() => setFilter(filter === t ? null : t)} />
        ))}
        {flaggedIds.size > 0 && (
          <Chip label={`⚑ Flagged ${flaggedIds.size}`} pressed={filter === 'flagged'}
                onClick={() => setFilter(filter === 'flagged' ? null : 'flagged')} />
        )}
        <Button variant="ghost" disabled={unread.length === 0}
                onClick={() => markAllRead(notes.map((n) => n.id))}>
          Mark all read
        </Button>
      </header>

      {NOTE_GROUPS.map((group) => {
        const rows = shown.filter((n) => n.group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} className="gr-note-group">
            <header className="gr-note-group__head">
              {/* "This week" is only true of the latest data. Under custom
                  dates it is the window's last week -- said with its dates. */}
              <h3 className="gr-type-card-heading">
                {group === 'This week' && windowEnd() > 0 && weekLabels().now ? `Week of ${weekLabels().now}` : group}
              </h3>
              <span className="gr-dec__count gr-type-caption-med">{rows.length}</span>
              <span className="gr-type-caption gr-note-group__note">{GROUP_NOTE[group]}</span>
            </header>
            <ul className="gr-card gr-note-list">
              {rows.map((n) => (
                <NoteRow
                  key={n.id} note={n}
                  isRead={read.has(n.id)} flagged={flaggedIds.has(n.id)}
                  onOpen={n.opensDecisions ? () => onOpenDecisions?.() : onOpen}
                  onAsk={onAsk}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {shown.length === 0 && (
        <div className="gr-card gr-note-empty">
          <p className="gr-type-body">
            {notes.length === 0
              ? 'Nothing crossed a threshold this week. That is a real answer — every rule ran and found nothing worth interrupting you for.'
              : 'Nothing in this filter.'}
          </p>
        </div>
      )}
    </>
  );
}

function NoteRow({ note: n, isRead, flagged, onOpen, onAsk }: {
  note: Note; isRead: boolean; flagged: boolean;
  onOpen?: (t: Target, view?: NoteView) => void;
  onAsk?: (q: string, subject?: Target, view?: NoteView) => void;
}) {
  /* A week-over-week alert is a 7-day claim; anything else keeps the range. */
  const view: NoteView | undefined = n.group === 'This week' || n.kind === 'pacing'
    ? { metric: n.metric ?? 'Spend', range: LAST_WEEK as Range } : n.metric ? { metric: n.metric } : undefined;
  const where = n.opensDecisions ? 'Decisions'
    : n.target.kind === 'account' ? 'All channels'
    : n.target.kind === 'campaign' && n.channel ? `${CHANNEL_LABEL[n.channel]} › ${n.target.label}`
    : n.target.label;
  /* Phrased the way the assistant's "why is X up" path reads a question, so
     Ask lands on the answer about THIS change rather than a generic summary. */
  const question = n.opensDecisions
    ? (n.id.startsWith('dec:overdue') ? "What's overdue?" : 'How are my decisions going?')
    : n.metric && n.channel && n.change !== undefined
    ? `Why is ${CHANNEL_LABEL[n.channel]} ${n.metric} ${n.change > 0 ? 'up' : 'down'}?`
    : `What's going on with ${n.target.kind === 'account' ? 'all channels' : n.target.label}?`;

  return (
    <li className={`gr-note ${isRead ? '' : 'is-unread'} tone-${n.tone}`}>
      {/* The row opens its subject. A real button, because every row now has
          somewhere to go -- no alert is left pointing nowhere. */}
      <button
        type="button"
        className="gr-unbutton gr-note__open"
        onClick={() => { markRead(n.id); onOpen?.(n.target, view); }}
        aria-label={`${n.message} Open ${n.target.kind === 'account' ? 'all channels' : n.target.label}.`}
      >
        <span className="gr-note__mark" aria-hidden="true">
          {n.channel
            ? <ChannelMark channel={n.channel} size={20} />
            : <span className="gr-note__all">{n.opensDecisions ? '📌' : '∑'}</span>}
          <span className={`gr-note__tone gr-note__tone--${n.tone}`} />
        </span>
        <span className="gr-note__body">
          <span className="gr-type-body-medium gr-note__message">{n.message}</span>
          <span className="gr-type-caption gr-note__meta">
            {where}
            <span className="gr-note__go"> · Open →</span>
          </span>
        </span>
      </button>

      {/* The evidence, beside the claim: both weeks drawn, and the change. */}
      {n.trend && n.change !== undefined && n.metric && (
        <span className="gr-note__evidence" aria-hidden="true">
          <Sparkline values={n.trend} channel={n.channel} variant="line" width={96} height={28} />
          <DeltaBadge percent={n.change} higherIsBetter={higherIsBetter(n.metric)} />
        </span>
      )}

      <span className="gr-note__actions">
        {onAsk && (
          <Chip label="Ask" onClick={() => onAsk(question, n.target, view)} />
        )}
        <Chip label={flagged ? '⚑ Flagged' : '⚑ Flag'} pressed={flagged}
              onClick={() => toggleFlag('notification', n.id, n.short)} />
        <Chip label={isRead ? 'Mark unread' : 'Mark read'}
              onClick={() => (isRead ? markUnread(n.id) : markRead(n.id))} />
      </span>

      {!isRead && <span className="gr-note__unread" aria-label="Unread" />}
    </li>
  );
}
