import { useState } from 'react';
import { markAllRead, markRead, markUnread, usePrefs } from '../data/prefs';
import { toggleFlag, useFlags } from '../data/attention';
import './screens.css';
import { Button } from '../components/Button/Button';

import { Badge } from '../components/Badge/Badge';
import { Chip } from '../components/Chip/Chip';

type Tone = 'bad' | 'warn' | 'good';

export interface Alert {
  id: string;
  day: string;
  tone: Tone;
  message: string;
  channel: string;
  time: string;
  unread: boolean;
  /**
   * The campaign this alert is ABOUT, when it is about one.
   *
   * Deliberately optional. An alert naming a campaign should open it; a
   * channel-level alert names no campaign and must stay unclickable, because
   * a row that looks activatable and lands you somewhere arbitrary is worse
   * than one that does nothing.
   */
  campaignId?: string;
}

/* Exported so the link targets can be asserted. A hardcoded campaign id is
   exactly the kind of reference that rots silently -- it keeps compiling after
   the campaign it names is renamed, re-channelled or removed. */
export const ALERTS: Alert[] = [
  { id: 'n1', day: 'Today',     tone: 'bad',  message: 'Meta CAC rose 42% week over week, driven by Advantage+ Evergreen Signups.', channel: 'Meta',        time: '09:14', unread: true,  campaignId: 'c1' },
  /* No campaignId: pacing is a CHANNEL fact, spread across every TikTok
     campaign. Picking one to open would invent an attribution the alert does
     not make. */
  { id: 'n2', day: 'Today',     tone: 'warn', message: 'TikTok is pacing 18% behind its monthly spend target.',            channel: 'TikTok',      time: '08:02', unread: true },
  { id: 'n3', day: 'Today',     tone: 'good', message: 'Affiliate leads spiked 31% after the Tier 1 partner refresh.',     channel: 'Affiliates',  time: '07:30', unread: false, campaignId: 'c6' },
  { id: 'n4', day: 'Yesterday', tone: 'warn', message: 'Paid Search non-brand ROAS fell below the 2.0x floor.',            channel: 'Paid Search', time: '16:45', unread: false, campaignId: 'c8' },
  { id: 'n5', day: 'Yesterday', tone: 'good', message: 'YouTube Shorts cutdowns cleared review and are now live.',         channel: 'YouTube',     time: '11:20', unread: false, campaignId: 'c5' },
  { id: 'n6', day: 'Yesterday', tone: 'bad',  message: 'Podcast sponsorship ended with CAC at $128.80, 3x blended.',       channel: 'Podcasts',    time: '09:05', unread: false, campaignId: 'c9' },
];

export interface NotificationsProps {
  /** Opens the campaign an alert is about. */
  onOpenCampaign?: (id: string) => void;
}

export function Notifications({ onOpenCampaign }: NotificationsProps) {
  const [filter, setFilter] = useState<Tone | 'flagged' | null>(null);
  /* Persisted. "Mark all read" used to set local state that App.tsx unmounted
     on the next navigation, so the badge you had just cleared was back before
     you returned to it. */
  const { readAlerts } = usePrefs();
  const read = new Set(readAlerts);
  /* Read from the SUBSCRIBED value, not from the module directly. isFlagged()
     reads the store's cache, which is correct but does not tell React anything
     -- a flag set elsewhere would not repaint this list. The hook is what makes
     it reactive, so the hook's value is what gets read. */
  const flaggedIds = new Set(useFlags()
    .filter((f) => f.kind === 'notification')
    .map((f) => f.refId));

  const shown = filter === null ? ALERTS
    : filter === 'flagged' ? ALERTS.filter((a) => flaggedIds.has(a.id))
    : ALERTS.filter((a) => a.tone === filter);
  const days = [...new Set(shown.map((a) => a.day))];
  const unreadCount = ALERTS.filter((a) => a.unread && !read.has(a.id)).length;

  return (
    <>
      <header className="gr-section-head">
        <Badge
          label={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          tone={unreadCount > 0 ? 'accent' : 'neutral'}
        />
        <span className="gr-spacer" />
        {/* FILTERS, and they now look like it.

            These read as labels you apply rather than filters you set, and the
            fault was the presentation: no All, no pressed state, and an x that
            appeared only after clicking. The creative section already
            established the pattern -- All plus a pressed chip -- and this was
            the odd one out.

            ⚠️ "Needs attention" was also renamed, because it had become a
            collision I introduced: the Overview strip is called Needs
            attention, flagging adds to it, and this chip used the same words to
            mean something else entirely (tone: bad). Two controls, one name,
            different jobs. */}
        <Chip label="All" pressed={filter === null} onClick={() => setFilter(null)} />
        {(['bad', 'warn', 'good'] as Tone[]).map((t) => (
          <Chip
            key={t}
            label={t === 'bad' ? 'Issues' : t === 'warn' ? 'Pacing' : 'Wins'}
            pressed={filter === t}
            onClick={() => setFilter(t)}
          />
        ))}

        {/* The flags finally have somewhere to be READ. You could set them and
            then only ever see them on Overview; this is the list they belong
            to. Shown only when there are any, so it is never an empty filter. */}
        {flaggedIds.size > 0 && (
          <Chip
            label={`⚑ Flagged (${flaggedIds.size})`}
            pressed={filter === 'flagged'}
            onClick={() => setFilter(filter === 'flagged' ? null : 'flagged')}
          />
        )}
        <Button
          variant="ghost"
          /* Disabled when there is nothing to mark -- a button that reports
             success on a no-op is the same lie as one with no handler. */
          disabled={unreadCount === 0}
          onClick={() => markAllRead(ALERTS.filter((a) => a.unread).map((a) => a.id))}
        >
          Mark all read
        </Button>
      </header>

      <div className="gr-card">
        <div className="gr-feed">
          {days.map((day) => (
            <div key={day}>
              <p className="gr-feed__day gr-type-overline">{day}</p>
              {shown.filter((a) => a.day === day).map((a) => {
                /* A real <button> only when there is somewhere to go. The rest
                   stay plain divs -- giving every row a button role would
                   announce an action to a screen reader that half of them do
                   not have. */
                const canOpen = Boolean(a.campaignId && onOpenCampaign);
                const Tag = canOpen ? 'button' : 'div';
                return (
                  <div key={a.id} className="gr-feed__row">
                  <Tag
                    className={`gr-feed__item ${canOpen ? 'gr-unbutton is-clickable' : ''}`}
                    {...(canOpen ? {
                      type: 'button' as const,
                      onClick: () => {
                        /* Opening the alert reads it. Leaving it unread after
                           you have acted on it is the state the Mark all read
                           button exists to clean up, and it should not need
                           cleaning up for something you just opened. */
                        markAllRead([a.id]);
                        onOpenCampaign!(a.campaignId!);
                      },
                      'aria-label': `${a.message} Open campaign.`,
                    } : {})}
                  >
                    <span className={`gr-feed__dot gr-feed__dot--${a.tone}`} aria-hidden="true" />
                    <div className="gr-feed__body">
                      <p className="gr-type-body">{a.message}</p>
                      <p className="gr-feed__meta gr-type-caption">
                        {a.channel} · {a.time}
                        {canOpen && <span className="gr-feed__go"> · View campaign →</span>}
                      </p>
                    </div>
                    {a.unread && !read.has(a.id) && (
                      <span className="gr-feed__unread" aria-label="Unread" />
                    )}
                  </Tag>

                  {/* SIBLINGS of the row, not children.

                      The row is a <button> when it can navigate, and a button
                      cannot contain a button -- browsers resolve that by
                      dropping one, which is not a gamble worth taking on the
                      controls that undo things. */}
                  {/* Chips, not bespoke buttons.

                      These were hand-built and looked it: 3px of vertical
                      padding on a 4px grid, their own radius, their own
                      typography, matching nothing else on the page. Chip
                      already IS this pattern -- 24px, pressed state, one set of
                      tokens -- and the creative filters two screens away were
                      already using it. Building a fifth kind of small toggle
                      was the mistake. */}
                  <span className="gr-feed__actions">
                    <Chip
                      label={flaggedIds.has(a.id) ? '⚑ Flagged' : '⚑ Flag'}
                      pressed={flaggedIds.has(a.id)}
                      onClick={() => toggleFlag('notification', a.id, a.message.replace(/\.$/, ''))}
                    />
                    <Chip
                      label={read.has(a.id) ? 'Mark unread' : 'Mark read'}
                      onClick={() => (read.has(a.id) ? markUnread(a.id) : markRead(a.id))}
                    />
                  </span>
                  </div>
                );
              })}
            </div>
          ))}
          {shown.length === 0 && (
            <p className="gr-type-body" style={{ padding: 'var(--space-24) 0', color: 'var(--text-muted)' }}>
              Nothing in this category.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
