import { useState } from 'react';
import './screens.css';
import { Button } from '../components/Button/Button';
import { Chip } from '../components/Chip/Chip';
import { Badge } from '../components/Badge/Badge';

type Tone = 'bad' | 'warn' | 'good';

interface Alert {
  id: string;
  day: string;
  tone: Tone;
  message: string;
  channel: string;
  time: string;
  unread: boolean;
}

const ALERTS: Alert[] = [
  { id: 'n1', day: 'Today',     tone: 'bad',  message: 'Meta CAC rose 42% week over week, driven by Advantage+ Shopping.', channel: 'Meta',        time: '09:14', unread: true },
  { id: 'n2', day: 'Today',     tone: 'warn', message: 'TikTok is pacing 18% behind its monthly spend target.',            channel: 'TikTok',      time: '08:02', unread: true },
  { id: 'n3', day: 'Today',     tone: 'good', message: 'Affiliate leads spiked 31% after the Tier 1 partner refresh.',     channel: 'Affiliates',  time: '07:30', unread: false },
  { id: 'n4', day: 'Yesterday', tone: 'warn', message: 'Paid Search non-brand ROAS fell below the 2.0x floor.',            channel: 'Paid Search', time: '16:45', unread: false },
  { id: 'n5', day: 'Yesterday', tone: 'good', message: 'YouTube Shorts cutdowns cleared review and are now live.',         channel: 'YouTube',     time: '11:20', unread: false },
  { id: 'n6', day: 'Yesterday', tone: 'bad',  message: 'Podcast sponsorship ended with CAC at $128.80, 3x blended.',       channel: 'Podcasts',    time: '09:05', unread: false },
];

export function Notifications() {
  const [filter, setFilter] = useState<Tone | null>(null);
  const [read, setRead] = useState<Set<string>>(new Set());

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
        <Button variant="ghost" onClick={() => setRead(new Set(ALERTS.map((a) => a.id)))}>
          Mark all read
        </Button>
      </header>

      <div className="gr-card">
        <div className="gr-feed">
          {days.map((day) => (
            <div key={day}>
              <p className="gr-feed__day gr-type-overline">{day}</p>
              {shown.filter((a) => a.day === day).map((a) => (
                <div key={a.id} className="gr-feed__item">
                  <span className={`gr-feed__dot gr-feed__dot--${a.tone}`} aria-hidden="true" />
                  <div className="gr-feed__body">
                    <p className="gr-type-body">{a.message}</p>
                    <p className="gr-feed__meta gr-type-caption">{a.channel} · {a.time}</p>
                  </div>
                  {a.unread && !read.has(a.id) && (
                    <span className="gr-feed__unread" aria-label="Unread" />
                  )}
                </div>
              ))}
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
