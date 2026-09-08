import { useState } from 'react';
import { markAllRead, usePrefs } from '../data/prefs';
import './screens.css';
import { Button } from '../components/Button/Button';
import { Chip } from '../components/Chip/Chip';
import { Badge } from '../components/Badge/Badge';

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
  const [filter, setFilter] = useState<Tone | null>(null);
  /* Persisted. "Mark all read" used to set local state that App.tsx unmounted
     on the next navigation, so the badge you had just cleared was back before
     you returned to it. */
  const { readAlerts } = usePrefs();
  const read = new Set(readAlerts);

  const shown = filter ? ALERTS.filter((a) => a.tone === filter) : ALERTS;
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
        {(['bad', 'warn', 'good'] as Tone[]).map((t) => (
          <Chip
            key={t}
            label={t === 'bad' ? 'Needs attention' : t === 'warn' ? 'Pacing' : 'Wins'}
            onClick={() => setFilter(filter === t ? null : t)}
            removable={filter === t}
            onRemove={() => setFilter(null)}
          />
        ))}
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
                  <Tag
                    key={a.id}
                    className={`gr-feed__item ${canOpen ? 'is-clickable' : ''}`}
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
