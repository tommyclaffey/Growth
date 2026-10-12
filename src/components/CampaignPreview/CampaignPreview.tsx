import './CampaignPreview.css';
import { StatusPill } from '../StatusPill/StatusPill';
import { ChannelMark } from '../ChannelMark/ChannelMark';
import { CAMPAIGNS } from '../../data/campaigns';
import { useCampaignStatus } from '../../data/campaignStatus';
import { creativesFor, creativeTotals, rankCreatives, topDistinct } from '../../data/creative';
import { formatDerived, valueOf, type DerivedMetric } from '../../data/channelMetrics';
import type { Range } from '../../data/metrics';
import type { ChannelName } from '../../styles/tokens';

export interface CampaignPreviewProps {
  channel: ChannelName;
  range: Range;
  /** Opens an ad on its own page, inside its campaign and ad set. */
  onOpenAd: (ad: { id: string; campaignId: string; adSetId: string }) => void;
}

/* Six fills the grid at every width: 3 + 3, 2 + 2 + 2, or one column. */
const SHOWN = 6;
const STATS: DerivedMetric[] = ['Spend', 'Leads', 'CAC'];

/**
 * What is running on this channel, as the ads themselves.
 *
 * ⭐ Oct 12: this was one card per running CAMPAIGN. Most channels run one or
 * two campaigns, so the section was a single card in a three-wide row, which
 * reads as an account that barely runs anything (Tommy: "No screen should ever
 * not be full"). A channel's campaigns run a dozen ads between them, and the ads
 * are what the money is buying, so the section now shows the top six running
 * ads across the channel's live campaigns.
 *
 * Ranked by the same function the campaign page uses, so the #1 here is the
 * best ad there too. Each card names its campaign and ad set, so nothing about
 * the campaign view is lost; the table below still lists every campaign.
 *
 * ⚠️ Running only: an ad counts when it is Active inside an Active campaign.
 * Paused and ended campaigns sit in the table below with their status on them.
 */
export function CampaignPreview({ channel, range, onOpenAd }: CampaignPreviewProps) {
  const stageOf = useCampaignStatus();
  const running = CAMPAIGNS.filter((c) => c.channel === channel && stageOf(c.id) === 'Active');
  const ads = topDistinct(rankCreatives(
    running.flatMap((c) => creativesFor(c.id).filter((x) => x.stage === 'Active')),
    'Leads', range,
  ), SHOWN);

  if (ads.length === 0) {
    return (
      <p className="gr-cpreview__none gr-type-body">
        Nothing is running on this channel right now. Paused and completed campaigns
        are in the table below.
      </p>
    );
  }

  return (
    <div className="gr-cpreview-grid">
      {ads.map((ad, i) => {
        const campaign = running.find((c) => creativesFor(c.id).some((x) => x.id === ad.id));
        const t = creativeTotals(ad.id, range);
        const art = ad.src ?? ad.image;
        return (
          <button
            key={ad.id}
            type="button"
            className="gr-cpreview gr-unbutton"
            onClick={() => campaign && onOpenAd({ id: ad.id, campaignId: campaign.id, adSetId: ad.adSetId })}
            aria-label={`Open ad “${ad.headline}”`}
          >
            <span className="gr-cpreview__art">
              {art ? (
                <img src={art} alt="" loading="lazy" style={{ objectPosition: ad.focus }} />
              ) : (
                /* A lone logo in a large empty band reads as a broken image.
                   It has to say it is a state, not a failure. */
                <span className="gr-cpreview__noart">
                  <ChannelMark channel={channel} size={22} />
                  <span className="gr-type-caption">No creative yet</span>
                </span>
              )}
              <span className="gr-cpreview__rank gr-type-caption-med">#{i + 1}</span>
            </span>

            <span className="gr-cpreview__body">
              <span className="gr-cpreview__head">
                <span className="gr-cpreview__name gr-type-strip">{ad.headline}</span>
                <StatusPill stage="Active" />
              </span>
              <span className="gr-cpreview__meta gr-type-caption">
                {campaign?.name} · {ad.adSetName}
              </span>

              <span className="gr-cpreview__stats">
                {STATS.map((m) => (
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
