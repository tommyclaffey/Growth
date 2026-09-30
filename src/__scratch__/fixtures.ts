import type { MetaAd, MetaAdSet, MetaCampaign, MetaInsight } from '../data/sources/metaNormalize';
import type { GRow } from '../data/sources/googleNormalize';
import { dayList } from '../data/sources/metaNormalize';

export const NOW = new Date('2026-09-29T15:00:00Z');   // last complete day in Detroit: 2026-09-28
export const DAYS = 455;
const END = '2026-09-28';

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SPECIAL = {
  quote: 'Q4 — 20% Off / Sale\'s Best',
  emoji: '🔥 Black Friday 🚀 "Early Access", VIP',
  long: 'Always-On | Prospecting | Advantage+ Shopping | US+CA | 25-65+ | All Placements | '
    + 'Broad w/ Exclusions (Purchasers 180d, Leads 30d) | Cost Cap $42 | DCO | Test Cell B — '.repeat(2).trim(),
};

/* Real-world naming convention: a shared prefix. */
const prefixes = ['US | Prospecting | ', 'US | Retargeting | ', 'CA | Prospecting | ', 'UK | Prospecting | '];
const audiences = ['Broad 25-54', 'Lookalike 1%', 'Lookalike 3%', 'Interest Stack', 'ASC', 'Engagers 90d', 'Site Visitors 30d', 'Cart 7d'];

export function metaName(i: number): string {
  if (i === 0) return SPECIAL.quote;
  if (i === 1) return SPECIAL.emoji;
  if (i === 2) return SPECIAL.long;
  return `${prefixes[i % 4]}${audiences[i % 8]} | v${i}`;
}

export function buildMeta() {
  const r = rng(42);
  const dates = dayList(END, DAYS);
  const campaigns: MetaCampaign[] = [];
  const adsets: MetaAdSet[] = [];
  const ads: MetaAd[] = [];
  const insights: MetaInsight[] = [];
  const objectives = ['OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC', 'OUTCOME_AWARENESS'];

  for (let c = 0; c < 60; c++) {
    const cid = `2385${String(c).padStart(8, '0')}`;
    const name = metaName(c);
    /* 0-39 active, 40-49 paused (stopped 60 days ago), 50-51 in review,
       52-54 archived-but-listed, 55-59 DELETED (absent from the list, history only, stopped 100 days ago). */
    const status = c < 40 ? 'ACTIVE' : c < 50 ? 'PAUSED' : c < 52 ? 'PENDING_REVIEW' : c < 55 ? 'ARCHIVED' : 'DELETED';
    const stopAt = c < 40 ? DAYS : c < 50 ? DAYS - 60 : c < 52 ? DAYS - 3 : c < 55 ? DAYS - 200 : DAYS - 100;
    const startAt = Math.floor(r() * 120);
    if (status !== 'DELETED') campaigns.push({ id: cid, name, objective: objectives[c % 4], effective_status: status });
    const scale = 20 + r() * 400;
    for (let s = 0; s < 4; s++) {
      const sid = `${cid}${s}`;
      if (status !== 'DELETED') adsets.push({ id: sid, name: `${name} › Ad set ${s + 1}`, campaign_id: cid, effective_status: s === 3 ? 'PAUSED' : status });
      for (let a = 0; a < 5; a++) {
        const aid = `${sid}${a}`;
        const zeroLeads = (c * 20 + s * 5 + a) % 17 === 0;
        const adStatus = a === 4 ? 'PAUSED' : s === 3 ? 'ADSET_PAUSED' : status;
        if (status !== 'DELETED') {
          ads.push({
            id: aid, name: `Ad ${a + 1} — ${c}/${s}`, adset_id: sid, campaign_id: cid, effective_status: adStatus,
            creative: a === 2 ? {} : { title: a === 1 ? `Save 20% — "today" only, ${c}` : `Hook ${a} for ${c}-${s}`, body: 'Body copy', thumbnail_url: a === 3 ? undefined : `https://scontent.example/${aid}.jpg`, object_type: a % 2 ? 'VIDEO' : 'SHARE' },
          });
        }
        const eff = 0.4 + r() * 1.6;
        const adStop = a === 4 ? Math.min(stopAt, DAYS - 20) : stopAt;
        for (let d = startAt; d < adStop; d++) {
          if (r() < 0.03) continue;                        // a day with no delivery -- no row at all
          const spend = scale * (0.5 + r()) / 20;
          const clicks = Math.round(spend * (1 + r()));
          const leads = zeroLeads ? 0 : Math.round((spend / (30 * eff)) * (0.5 + r()));
          const purchases = zeroLeads ? 0 : (r() < 0.2 ? 1 : 0);
          const row: MetaInsight = {
            campaign_id: cid, adset_id: sid, ad_id: aid, campaign_name: name, date_start: dates[d],
            spend: spend.toFixed(2), impressions: String(Math.round(spend * 80)), clicks: String(clicks),
            actions: [{ action_type: 'link_click', value: String(clicks) }],
          };
          if (leads > 0) {
            row.actions!.push({ action_type: 'lead', value: String(leads) }, { action_type: 'offsite_conversion.fb_pixel_lead', value: String(leads) });
          }
          if (purchases) {
            row.actions!.push({ action_type: 'purchase', value: '1' });
            row.action_values = [{ action_type: 'purchase', value: (40 + r() * 200).toFixed(2) }];
          }
          insights.push(row);
        }
      }
    }
  }
  return {
    account: { name: 'Acme — Meta', currency: 'USD', timezone_name: 'America/Detroit' },
    campaigns, adsets, ads, insights, now: NOW, days: DAYS,
  };
}

export function buildGoogle() {
  const r = rng(7);
  const dates = dayList(END, DAYS);
  const campaigns: GRow[] = [];
  const adGroups: GRow[] = [];
  const ads: GRow[] = [];
  const campPerf: GRow[] = [];
  const campConv: GRow[] = [];
  const adPerf: GRow[] = [];
  const adConv: GRow[] = [];
  const types = (i: number) => i < 22 ? 'SEARCH' : i < 30 ? 'PERFORMANCE_MAX' : i < 36 ? 'VIDEO' : 'DISPLAY';

  const omit = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== 0 && v !== '0' && v !== undefined));

  for (let c = 0; c < 41; c++) {
    const cid = String(17000000000 + c);
    const type = types(Math.min(c, 39));
    const name = c === 0 ? 'Brand — Exact | "Acme" & Co.' : c === 1 ? '🎯 PMax — Feed Only' : c === 40 ? 'Removed — Old Generic' : `${type} | Generic | Cluster ${c}`;
    const removed = c === 40;
    const status = c % 7 === 5 ? 'PAUSED' : 'ENABLED';
    const cRow = { id: cid, name, status, servingStatus: 'SERVING', advertisingChannelType: type };
    if (!removed) campaigns.push({ campaign: cRow });
    const pmax = type === 'PERFORMANCE_MAX';
    const stop = status === 'PAUSED' ? DAYS - 45 : removed ? DAYS - 150 : DAYS;
    const scale = 50 + r() * 900;
    const camp = { id: cid, name, advertisingChannelType: type };

    /* Ad groups + RSAs for non-PMax. */
    const myAds: { gid: string; aid: string; eff: number }[] = [];
    if (!pmax) {
      for (let g = 0; g < 3; g++) {
        const gid = String(140000000000 + c * 10 + g);
        if (!removed) adGroups.push({ campaign: { id: cid }, adGroup: { id: gid, name: `${name} › AG ${g + 1}`, status: 'ENABLED' } });
        for (let a = 0; a < 3; a++) {
          const aid = String(700000000000 + c * 100 + g * 10 + a);
          myAds.push({ gid, aid, eff: 0.5 + r() * 1.5 });
          if (removed) continue;
          const adType = type === 'VIDEO' ? 'VIDEO_RESPONSIVE_AD' : type === 'DISPLAY' ? 'RESPONSIVE_DISPLAY_AD' : 'RESPONSIVE_SEARCH_AD';
          const f = { headlines: [{ text: a === 0 ? `Acme® Official Site — ${c}.${g}` : `Headline ${a} for ${c}/${g}` }, { text: 'Second' }], descriptions: a === 2 ? undefined : [{ text: 'Free shipping, 30-day returns.' }] };
          ads.push({
            campaign: { id: cid }, adGroup: { id: gid },
            adGroupAd: {
              status: a === 2 ? 'PAUSED' : 'ENABLED', policySummary: { reviewStatus: 'REVIEWED' },
              ad: {
                id: aid, type: adType,
                ...(adType === 'RESPONSIVE_SEARCH_AD' ? { responsiveSearchAd: f } : adType === 'VIDEO_RESPONSIVE_AD' ? { videoResponsiveAd: f } : { responsiveDisplayAd: f }),
              },
            },
          });
        }
      }
    }

    for (let d = 0; d < stop; d++) {
      const date = dates[d];
      if (r() < 0.02) continue;
      if (pmax || myAds.length === 0) {
        const cost = scale * (0.5 + r());
        campPerf.push({ campaign: camp, segments: { date }, metrics: omit({ costMicros: String(Math.round(cost * 1e6)), impressions: String(Math.round(cost * 30)), clicks: String(Math.round(cost / 2)) }) as GRow['metrics'] });
        campConv.push({ campaign: camp, segments: { date, conversionActionCategory: 'SUBMIT_LEAD_FORM' }, metrics: omit({ conversions: +(cost / 45 * r()).toFixed(4) }) as GRow['metrics'] });
        campConv.push({ campaign: camp, segments: { date, conversionActionCategory: 'PURCHASE' }, metrics: omit({ conversions: +(r() * 2).toFixed(3), conversionsValue: +(r() * 400).toFixed(2) }) as GRow['metrics'] });
        continue;
      }
      let dayCost = 0; let dayLeads = 0;
      for (const ad of myAds) {
        if (r() < 0.05) continue;
        const cost = (scale / 9) * (0.3 + r());
        dayCost += cost;
        const leads = +(cost / (40 * ad.eff) * r()).toFixed(4);   // fractional, data-driven
        dayLeads += leads;
        const keys = { campaign: camp, adGroup: { id: ad.gid, name: `grp ${ad.gid}` }, adGroupAd: { ad: { id: ad.aid } } };
        adPerf.push({ ...keys, segments: { date }, metrics: omit({ costMicros: String(Math.round(cost * 1e6)), impressions: String(Math.round(cost * 30)), clicks: String(Math.round(cost / 3)) }) as GRow['metrics'] });
        adConv.push({ ...keys, segments: { date, conversionActionCategory: 'SUBMIT_LEAD_FORM' }, metrics: omit({ conversions: leads }) as GRow['metrics'] });
        adConv.push({ ...keys, segments: { date, conversionActionCategory: 'QUALIFIED_LEAD' }, metrics: omit({ conversions: +(leads / 3).toFixed(4) }) as GRow['metrics'] });
        if (r() < 0.15) adConv.push({ ...keys, segments: { date, conversionActionCategory: 'PURCHASE' }, metrics: omit({ conversions: 0.5, conversionsValue: +(r() * 300).toFixed(2) }) as GRow['metrics'] });
      }
      /* The campaign-level query returns these campaigns too. */
      campPerf.push({ campaign: camp, segments: { date }, metrics: omit({ costMicros: String(Math.round(dayCost * 1e6)) }) as GRow['metrics'] });
      campConv.push({ campaign: camp, segments: { date, conversionActionCategory: 'SUBMIT_LEAD_FORM' }, metrics: omit({ conversions: dayLeads }) as GRow['metrics'] });
    }
  }
  return {
    customer: { descriptiveName: 'Acme — Google', currencyCode: 'USD', timeZone: 'America/Detroit' },
    campaigns, adGroups, ads, metrics: [campPerf, campConv, adPerf, adConv].flat(), now: NOW, days: DAYS,
  };
}
