import './CampaignPreview.css';
import { StatusPill } from '../StatusPill/StatusPill';
import { ChannelMark } from '../ChannelMark/ChannelMark';
import { CAMPAIGNS } from '../../data/campaigns';
import { useCampaignStatus } from '../../data/campaignStatus';
import { campaignTotals } from '../../data/campaignSeries';
import { creativesFor, rankCreatives } from '../../data/creative';
import { formatDerived, kpisFor, valueOf } from '../../data/channelMetrics';
import type { Range } from '../../data/metrics';
import type { ChannelName } from '../../styles/tokens';

export interface CampaignPreviewProps {
  channel: ChannelName;
  range: Range;
  onOpen: (id: string) => void;
}

/**
 * Running campaigns on this channel, at a glance.
 *
 * The channel screen had a chart and a table. A table answers "what are the
 * numbers"; it does not answer "what is actually running", because a campaign
 * in a table row is a name and six figures with no face on it.
 *
 * Each card leads with the campaign's BEST-PERFORMING creative -- ranked by the
 * same function the campaign page uses -- so the ad shown here is the ad marked
 * #1 there. Two different definitions of "best" would be two answers to one
 * question.
 *
 * ⚠️ Running only. Paused campaigns sit in the table below with their status on
 * them; putting them in a section headed "Running" would be a heading that lies
 * about its own contents.
 */
export function CampaignPreview({ channel, range, onOpen }: CampaignPreviewProps) {
  const stageOf = useCampaignStatus();
  const running = CAMPAIGNS.filter((c) => c.channel === channel && stageOf(c.id) === 'Active');

  if (running.length === 0) {
    return (
      <p className="gr-cpreview__none gr-type-body">
        Nothing is running on this channel right now. Paused and completed campaigns
        are in the table below.
      </p>
    );
  }

  return (
    <div className="gr-cpreview-grid">
      {running.map((c) => {
        const t = campaignTotals(c.id, range);
        const hero = rankCreatives(
          creativesFor(c.id).filter((x) => x.stage === 'Active'), 'Leads',
        )[0];
        /* Three KPIs, chosen by the same channel-and-objective rule the campaign
           page uses. A podcast campaign never shows CTR here either. */
        const kpis = kpisFor(c.channel, c.objective).slice(0, 3);

        return (
          <button
            key={c.id}
            type="button"
            className="gr-cpreview"
            onClick={() => onOpen(c.id)}
            aria-label={`Open ${c.name}`}
          >
            <span className="gr-cpreview__art">
              {hero?.src ? (
                <img src={hero.src} alt="" loading="lazy"
                     style={{ objectPosition: hero.focus }} />
              ) : (
                /* A lone logo in a large empty band reads as a broken image.
                   It has to say it is a state, not a failure -- the same
                   labelled-empty treatment the ad cards use. */
                <span className="gr-cpreview__noart">
                  <ChannelMark channel={channel} size={22} />
                  <span className="gr-type-caption">No creative yet</span>
                </span>
              )}
            </span>

            <span className="gr-cpreview__body">
              <span className="gr-cpreview__head">
                <span className="gr-cpreview__name gr-type-strip">{c.name}</span>
                <StatusPill stage={stageOf(c.id)} />
              </span>
              <span className="gr-cpreview__meta gr-type-caption">
                {c.objective} · {c.adSets.length} ad set{c.adSets.length === 1 ? '' : 's'}
              </span>

              <span className="gr-cpreview__stats">
                {kpis.map((m) => (
                  <span key={m}>
                    <span className="gr-type-overline">{m}</span>
                    <span className="gr-type-body-medium">{formatDerived(m, valueOf(m, t))}</span>
                  </span>
                ))}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
