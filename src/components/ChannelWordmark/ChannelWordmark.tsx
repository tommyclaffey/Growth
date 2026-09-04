import googleAds from '../../assets/brand/google-ads.svg';
import metaLogo from '../../assets/brand/meta.svg';
import tiktokLogo from '../../assets/brand/tiktok.svg';
import youtubeLogo from '../../assets/brand/youtube.svg';
import './ChannelWordmark.css';
import { ChannelMark } from '../ChannelMark/ChannelMark';
import type { ChannelName } from '../../styles/tokens';

/**
 * A channel, named the way the design names it.
 *
 * Three shapes, because the file uses three — and it uses three because the
 * channels are not the same kind of thing:
 *
 *   Meta, TikTok, YouTube  a full lockup, standing in for the name
 *   Paid Search            the Google Ads mark beside the name, because the
 *                          channel is not called "Google Ads"
 *   Affiliates, Podcasts   the channel mark beside the name — no product to
 *                          borrow a logo from
 *
 * The visible name is hidden but not removed when a lockup replaces it: a
 * heading whose only content is an image is a heading with no text.
 */

const LOCKUPS: Partial<Record<string, string>> = {
  meta: metaLogo,
  tiktok: tiktokLogo,
  youtube: youtubeLogo,
};

/** Product marks that are not the channel's name — shown alongside it. */
const MARKS: Partial<Record<string, string>> = {
  paidSearch: googleAds,
};

export function hasWordmark(channel: string | null): boolean {
  return Boolean(channel && LOCKUPS[channel]);
}

export function ChannelWordmark(
  { channel, name, size = 'md' }: { channel: string; name: string; size?: 'md' | 'sm' },
) {
  const cls = `gr-wordmark${size === 'sm' ? ' is-sm' : ''}`;
  const lockup = LOCKUPS[channel];
  if (lockup) {
    return (
      <span className={cls}>
        <img src={lockup} alt="" className={`gr-wordmark__img is-${channel}`} />
        <span className="gr-sr-only">{name}</span>
      </span>
    );
  }
  const mark = MARKS[channel];
  return (
    <span className={cls}>
      {mark
        ? <img src={mark} alt="" className="gr-wordmark__mark" />
        : <ChannelMark channel={channel as ChannelName} size={size === 'sm' ? 14 : 26} />}
      <span className="gr-wordmark__name">{name}</span>
    </span>
  );
}
