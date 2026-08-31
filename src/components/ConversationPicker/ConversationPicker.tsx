import { useEffect, useMemo, useState } from 'react';
import './ConversationPicker.css';
import { Avatar } from '../Avatar/Avatar';
import {
  listConversations, listPeople, openConversation, startDm,
  type Conversation, type Person,
} from '../../data/slackDirectory';

/**
 * Switch conversation, or start a new one.
 *
 * Channels, group DMs and direct messages are one list rather than three
 * sections, because the thing being chosen is the same in every case — a place
 * to talk. The kind is carried by the mark beside the name, not by grouping.
 *
 * Selecting people composes a DM as you go: one person is a direct message,
 * more than one is a group. Slack treats those as different conversation types
 * but the choice a person is making is the same one, so it is not two flows.
 */

export interface ConversationPickerProps {
  currentId: string | null;
  onOpened: () => void;
  onClose: () => void;
}

export function ConversationPicker({ currentId, onOpened, onClose }: ConversationPickerProps) {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listConversations().then(setConversations);
    void listPeople().then(setPeople);
  }, []);

  const q = query.trim().toLowerCase();

  const shownConversations = useMemo(
    () => (conversations ?? []).filter((c) => !q || c.name.toLowerCase().includes(q)),
    [conversations, q],
  );
  const shownPeople = useMemo(
    () => (people ?? []).filter((p) => !q || p.name.toLowerCase().includes(q))
      .filter((p) => !selected.some((s) => s.id === p.id)),
    [people, q, selected],
  );

  async function open(c: Conversation) {
    setBusy(true);
    if (await openConversation(c)) onOpened();
    setBusy(false);
  }

  async function openDm() {
    if (selected.length === 0) return;
    setBusy(true);
    const name = selected.map((p) => p.name).join(', ');
    if (await startDm(selected.map((p) => p.id), name)) {
      setSelected([]);
      setQuery('');
      onOpened();
    }
    setBusy(false);
  }

  return (
    <div className="gr-picker">
      <div className="gr-picker__head">
        <input
          className="gr-picker__search gr-type-body"
          placeholder="Find a conversation or a person…"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="gr-picker__close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {selected.length > 0 && (
        <div className="gr-picker__selected">
          {selected.map((p) => (
            <button key={p.id} type="button" className="gr-picker__chip gr-type-caption"
                    onClick={() => setSelected((cur) => cur.filter((s) => s.id !== p.id))}>
              {p.name} <span aria-hidden="true">✕</span>
            </button>
          ))}
          <button type="button" className="gr-picker__go gr-type-caption" onClick={() => void openDm()} disabled={busy}>
            {selected.length > 1 ? `Message ${selected.length} people` : 'Message'}
          </button>
        </div>
      )}

      <div className="gr-picker__list">
        {shownConversations.length > 0 && (
          <p className="gr-picker__label gr-type-overline">Conversations</p>
        )}
        {shownConversations.map((c) => (
          <button key={c.id} type="button" disabled={busy}
                  className={`gr-picker__row gr-type-body ${c.id === currentId ? 'is-current' : ''}`}
                  onClick={() => void open(c)}>
            <ConversationMark c={c} />
            <span className="gr-picker__name">{c.name}</span>
            {/* Said up front rather than discovered as a failed read: a
                conversation the bot is not in returns not_in_channel, which
                looks like a broken connection. */}
            {!c.joined && <span className="gr-picker__tag gr-type-micro">will join</span>}
          </button>
        ))}

        {shownPeople.length > 0 && <p className="gr-picker__label gr-type-overline">People</p>}
        {shownPeople.map((p) => (
          <button key={p.id} type="button" className="gr-picker__row gr-type-body" disabled={busy}
                  onClick={() => setSelected((cur) => [...cur, p])}>
            <Avatar initials={p.initials} hue={p.hue} size={24} src={p.avatar} />
            <span className="gr-picker__name">{p.name}</span>
          </button>
        ))}

        {conversations === null && <p className="gr-picker__empty gr-type-caption">Loading…</p>}
        {conversations !== null && shownConversations.length === 0 && shownPeople.length === 0 && (
          <p className="gr-picker__empty gr-type-caption">Nothing matches “{query}”.</p>
        )}
      </div>
    </div>
  );
}

/** A hash for channels, a lock for private, faces for group, avatar for a DM. */
function ConversationMark({ c }: { c: Conversation }) {
  if (c.kind === 'dm') {
    return <Avatar initials={c.name.slice(0, 2).toUpperCase()} hue={2} size={24} src={c.avatar} />;
  }
  return (
    <span className="gr-picker__glyph" aria-hidden="true">
      {c.kind === 'private' ? '🔒' : c.kind === 'group' ? '◍' : '#'}
    </span>
  );
}
