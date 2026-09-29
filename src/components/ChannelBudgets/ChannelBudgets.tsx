import { useState } from 'react';
import { ChannelWordmark } from '../ChannelWordmark/ChannelWordmark';
import { setChannelBudget, useChannelBudgets, useMonthlyBudget } from '../../data/profile';
import { useChannels } from '../../data/channels';
import { atLatest, CHANNEL_LABEL, formatMetric, totals } from '../../data/metrics';
import type { ChannelName } from '../../styles/tokens';

/**
 * A monthly budget per channel -- optional, and the difference between
 * "we are 36% under plan" and "TikTok is 30% under ITS plan".
 *
 * Each row shows the last 30 days' spend beside the input, so the number being
 * typed has something to be judged against. The footer says what is left of
 * the account budget, or that the channels add up to more than it.
 */
export function ChannelBudgets() {
  const channels = useChannels();
  const budgets = useChannelBudgets();
  const account = useMonthlyBudget();
  const allocated = Object.values(budgets).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <section className="gr-card">
      <header className="gr-card__header">
        <div className="gr-card__heading">
          <h3 className="gr-card__title gr-type-card-heading">Channel budgets</h3>
          <p className="gr-card__sub gr-type-caption">
            Optional. A channel with a budget gets pacing of its own in Notifications, and
            &ldquo;where should more budget go&rdquo; tells you how much of it is unspent.
          </p>
        </div>
      </header>
      {channels.map((ch) => <BudgetRow key={ch} ch={ch} value={budgets[ch]} />)}
      {allocated > 0 && (
        <p className={`gr-type-caption gr-budget__foot ${allocated > account ? 'is-over' : ''}`}>
          {allocated > account
            ? `Channel budgets add up to ${formatMetric('Spend', allocated)} — more than the ${formatMetric('Spend', account)} account budget.`
            : `${formatMetric('Spend', account - allocated)} of the ${formatMetric('Spend', account)} account budget is not assigned to a channel.`}
        </p>
      )}
    </section>
  );
}

function BudgetRow({ ch, value }: { ch: ChannelName; value?: number }) {
  const [text, setText] = useState(value ? String(value) : '');
  const n = Number(text.replace(/[^0-9.]/g, ''));
  const bad = text.trim() !== '' && !(n > 0);
  /* Budgets are about NOW: the latest 30 days, whatever window is picked. */
  const spent = atLatest(() => totals(ch, 30).spend);
  return (
    <div className="gr-setting-row">
      <span className="gr-setting-row__channel">
        <ChannelWordmark channel={ch} name={CHANNEL_LABEL[ch]} size="sm" />
      </span>
      <span className="gr-setting-row__text gr-type-caption">
        {formatMetric('Spend', spent)} spent in the last 30 days
        {value ? ` · ${Math.round((spent / value) * 100)}% of its budget` : ''}
      </span>
      <label className="gr-budget__field">
        <span className="gr-sr-only">{CHANNEL_LABEL[ch]} monthly budget</span>
        <input
          className="gr-budget__input gr-type-body"
          inputMode="numeric" placeholder="No budget"
          value={text} aria-invalid={bad}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value.replace(/[^0-9.]/g, ''));
            if (e.target.value.trim() === '') setChannelBudget(ch, null);
            else if (v > 0) setChannelBudget(ch, v);
          }}
        />
        <span className="gr-type-caption gr-budget__per">/ month</span>
      </label>
    </div>
  );
}
