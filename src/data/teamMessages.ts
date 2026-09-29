import { ME, type DecisionRef } from './chat';
import { appendMessage, openDirect } from './conversations';

function nowLabel(): string {
  return new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function dueText(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Tell someone they own a decision -- in their direct messages, with the
 * decision attached.
 *
 * ⭐ Assigning a decision used to change a field on a card only the assigner was
 * looking at. The owner was never told. A task system in which the person who
 * owns the task does not find out is a list of wishes.
 *
 * Local to Growth's own chat. The roster's teammates are not Slack users, so
 * there is no Slack account to deliver to -- and saying "sent to Slack" for a
 * message that went nowhere is the lie this product keeps refusing to tell.
 * Assigning to yourself sends nothing: you already know.
 */
export function notifyAssignment(ownerId: string, decision: DecisionRef): string | undefined {
  if (!ownerId || ownerId === ME.id) return undefined;
  const conv = openDirect([ownerId]);
  const due = dueText(decision.due);
  appendMessage(conv.id, {
    id: `assign-${decision.refId}-${Date.now()}`,
    authorId: ME.id,
    body: `I've assigned you a decision${due ? `, due ${due}` : ''}.`,
    time: nowLabel(),
    minutesAgo: 0,
    decision: { ...decision, owner: ownerId },
  });
  return conv.id;
}
