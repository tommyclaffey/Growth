import { useMemo, useState } from 'react';
import './ConversationList.css';
import { Avatar } from '../Avatar/Avatar';
import { useAvatarFor } from '../../data/profile';
import { MEMBERS, ME } from '../../data/chat';
import {
  conversationName, lastMessage, openDirect, others, sortedConversations, unreadCount,
} from '../../data/conversations';

/**
 * The inbox.
 *
 * A side panel is ~380px, so a persistent conversation rail beside the thread
 * does not fit — at that width it is two unusable columns instead of one
 * usable one. So the panel is two levels, list then thread, the way every
 * messaging app on a phone is. Nothing is hidden behind a modal that has to be
 * summoned; the list is a place you go back to.
 *
 * Channels, DMs and groups are ONE list, not three sections. The thing being
 * chosen is the same in every case — a place to talk — and grouping by kind
 * sorts by a property nobody is thinking about. Recency is what people
 * actually navigate by, so that is the sort. The kind is carried by the
 * avatar: a channel shows a #, a DM shows a face, a group shows two.
 */

export interface ConversationListProps {
  currentId: string | null;
  onOpen: (id: string) => void;
  slackChannel?: string;
}

export function ConversationList({ currentId, onOpen, slackChannel }: ConversationListProps) {
  const [query, setQuery] = useState('');
  const [composing, setComposing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const avatarFor = useAvatarFor();

  const conversations = useMemo(() => sortedConversations(), [currentId, composing]);
  const q = query.trim().toLowerCase();

  const shown = q
    ? conversations.filter((c) =>
        conversationName(c).toLowerCase().includes(q) ||
        others(c).some((p) => p.name.toLowerCase().includes(q)))
    : conversations;

  /* Everyone I could start something with. Me excluded — a DM with yourself is
     a feature some products have and none of them explain well. */
  const roster = Object.values(MEMBERS).filter((m) => m.id !== ME.id);
  const rosterShown = q ? roster.filter((m) => m.name.toLowerCase().includes(q)) : roster;

  function start() {
    if (picked.length === 0) return;
    const c = openDirect(picked);
    setPicked([]);
    setComposing(false);
    setQuery('');
    onOpen(c.id);
  }

  return (
    <div className="gr-convs">
      <div className="gr-convs__head">
        <input
          className="gr-convs__search gr-type-body"
          placeholder={composing ? 'Add people…' : 'Search conversations'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {/* Labelled, not an icon. Starting a conversation is the primary
            action in an inbox, and a pencil glyph is a guess the user has to
            make before they can act on it. */}
        <button
          type="button"
          className={`gr-convs__new gr-type-caption ${composing ? 'is-on' : ''}`}
          onClick={() => { setComposing((v) => !v); setPicked([]); setQuery(''); }}
        >
          {composing ? 'Cancel' : 'New message'}
        </button>
      </div>

      {composing ? (
        <>
          {/* One flow for both. Selecting one person is a DM, selecting more is
              a group — the user never chooses between two commands, they just
              keep tapping people. */}
          {picked.length > 0 && (
            <div className="gr-convs__picked">
              {picked.map((id) => (
                <button key={id} type="button" className="gr-convs__chip gr-type-caption"
                        onClick={() => setPicked((p) => p.filter((x) => x !== id))}>
                  {MEMBERS[id]?.name} <span aria-hidden="true">✕</span>
                </button>
              ))}
              <button type="button" className="gr-convs__go gr-type-caption" onClick={start}>
                {picked.length > 1 ? `Start group · ${picked.length}` : 'Message'}
              </button>
            </div>
          )}
          <ul className="gr-convs__list">
            {rosterShown.map((m) => {
              const on = picked.includes(m.id);
              return (
                <li key={m.id}>
                  <button type="button" className={`gr-conv ${on ? 'is-picked' : ''}`}
                          onClick={() => setPicked((p) => on ? p.filter((x) => x !== m.id) : [...p, m.id])}>
                    <Avatar initials={m.initials} hue={m.hue} name={m.name} src={avatarFor(m)} size={28} />
                    <span className="gr-conv__body">
                      <span className="gr-conv__name gr-type-body-medium">{m.name}</span>
                    </span>
                    <span className="gr-conv__check" aria-hidden="true">{on ? '✓' : ''}</span>
                  </button>
                </li>
              );
            })}
            {rosterShown.length === 0 && <li className="gr-convs__empty gr-type-caption">Nobody by that name.</li>}
          </ul>
        </>
      ) : (
        <ul className="gr-convs__list">
          {shown.map((c) => {
            const last = lastMessage(c);
            const unread = unreadCount(c);
            const people = others(c);
            const author = last ? (MEMBERS[last.authorId] ?? null) : null;
            /* "You: …" because in a DM the other person's name is already the
               conversation's name — repeating it on the preview line says
               nothing, while marking your own last message says who is waiting
               on whom. */
            const prefix = last && last.authorId === ME.id ? 'You: ' : '';
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`gr-conv ${c.id === currentId ? 'is-current' : ''} ${unread ? 'is-unread' : ''}`}
                  onClick={() => onOpen(c.id)}
                >
                  {c.kind === 'channel'
                    ? <span className="gr-conv__hash" aria-hidden="true">#</span>
                    : <Avatar initials={people[0]?.initials ?? '?'} hue={people[0]?.hue ?? 0}
                              name={people[0]?.name ?? ''} src={people[0] ? avatarFor(people[0]) : undefined}
                              size={28} />}
                  <span className="gr-conv__body">
                    <span className="gr-conv__row">
                      <span className="gr-conv__name gr-type-body-medium">{conversationName(c)}</span>
                      {last && <span className="gr-conv__time gr-type-caption">{last.time}</span>}
                    </span>
                    <span className="gr-conv__row">
                      <span className="gr-conv__preview gr-type-caption">
                        {last ? `${prefix}${author && !prefix && c.kind !== 'dm' ? `${author.name.split(' ')[0]}: ` : ''}${last.body}` : 'No messages yet'}
                      </span>
                      {unread > 0 && <span className="gr-conv__badge" aria-label={`${unread} unread`}>{unread}</span>}
                    </span>
                  </span>
                </button>
                {/* Named where it is true, rather than in a global status line
                    that implies every conversation is mirrored. Only one is. */}
                {c.mirrorsSlack && slackChannel && (
                  <p className="gr-conv__mirror gr-type-caption">Mirrored to #{slackChannel} in Slack</p>
                )}
              </li>
            );
          })}
          {shown.length === 0 && <li className="gr-convs__empty gr-type-caption">No conversations match.</li>}
        </ul>
      )}
    </div>
  );
}
