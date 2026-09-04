import googleAds from '../../assets/brand/google-ads.svg';
import metaLogo from '../../assets/brand/meta.svg';
import metaLogoDark from '../../assets/brand/meta-dark.svg';
import tiktokLogo from '../../assets/brand/tiktok.svg';
import tiktokLogoDark from '../../assets/brand/tiktok-dark.svg';
import youtubeLogo from '../../assets/brand/youtube.svg';
import youtubeLogoDark from '../../assets/brand/youtube-dark.svg';
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

/**
 * Reversed lockups: brand colour kept, wordmark knocked to white.
 *
 * Dark mode used `filter: brightness(0) invert(1)` on the light asset, which
 * flattens EVERY pixel to black and then lifts the whole thing to white --
 * a silhouette. That is fine for Meta, whose logo IS its silhouette, and it
 * destroys YouTube: the play triangle is white knocked out of the red
 * rounded rect, so silhouetting merges them into one white blob with no
 * triangle. TikTok lost its cyan and magenta the same way.
 *
 * The filter matched on VALUE -- every pixel, regardless of what it was --
 * without understanding ROLE. Only the near-black wordmark text should flip;
 * brand colours are owned by the brand and must survive.
 *
 * Both variants render and CSS shows one, rather than threading the theme
 * through as a prop. It also keeps each SVG in its own document, so Meta's
 * gradient ids cannot collide between the two.
 */
const LOCKUPS_DARK: Partial<Record<string, string>> = {
  meta: metaLogoDark,
  tiktok: tiktokLogoDark,
  youtube: youtubeLogoDark,
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
        <img src={lockup} alt="" className={`gr-wordmark__img is-${channel} is-light-only`} />
        <img src={LOCKUPS_DARK[channel] ?? lockup} alt="" className={`gr-wordmark__img is-${channel} is-dark-only`} />
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
