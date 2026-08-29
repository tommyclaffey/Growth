import metaLogo from '../../assets/brand/meta.svg';
import tiktokLogo from '../../assets/brand/tiktok.svg';
import youtubeLogo from '../../assets/brand/youtube.svg';
import './ChannelWordmark.css';

/**
 * The channel's own logo, standing in for the page title.
 *
 * Taken from the Brand section of the Figma file, where each lockup is used
 * exactly once — at Header / Toolbar / Title block / Name row. On a channel
 * screen the title *is* the logo.
 *
 * Only three exist, because only three of the six channels are products.
 * Affiliates, Paid Search and Podcasts fall back to the text title, which is
 * what the design does too. Not a gap to fill: there is no Affiliates logo.
 *
 * The visible name is hidden from sight but not from screen readers — an <h1>
 * whose only content is an image is a heading with no text.
 */

const LOGOS: Partial<Record<string, string>> = {
  meta: metaLogo,
  tiktok: tiktokLogo,
  youtube: youtubeLogo,
};

/** True when this channel has a lockup, so callers can pick the treatment. */
export function hasWordmark(channel: string | null): boolean {
  return Boolean(channel && LOGOS[channel]);
}

export function ChannelWordmark({ channel, name }: { channel: string; name: string }) {
  const src = LOGOS[channel];
  if (!src) return <>{name}</>;
  return (
    <span className="gr-wordmark">
      <img src={src} alt="" className={`gr-wordmark__img is-${channel}`} />
      <span className="gr-sr-only">{name}</span>
    </span>
  );
}
