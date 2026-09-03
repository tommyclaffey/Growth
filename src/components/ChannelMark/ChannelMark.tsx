import type { ReactNode } from 'react';
import googleAdsMark from '../../assets/brand/google-ads.svg';
import metaMark from '../../assets/brand/meta-mark.svg';
import tiktokMark from '../../assets/brand/tiktok-mark.svg';
import youtubeMark from '../../assets/brand/youtube-mark.svg';
import './ChannelMark.css';
import type { ChannelName } from '../../styles/tokens';
import { CSS_CHANNEL } from '../../styles/tokens';

/**
 * One mark per channel.
 *
 * The system had marks for half its channels and dots for the rest. Meta,
 * TikTok and YouTube are products with logos; Affiliates, Paid Search and
 * Podcasts are categories with nothing to borrow — which is why the design
 * used a coloured dot for all six. A dot distinguishes a channel; it does not
 * identify one. You learn the legend or you count colours.
 *
 * So: one visual language across both kinds. The real mark where one exists —
 * taken from the Figma file, not redrawn — and a glyph for what the channel
 * *is* where there is no product to borrow from.
 *
 * The four real marks carry their own brand colours, which is not the
 * inconsistency it looks like: this system's channel colours ARE the brand
 * colours (meta #0866FF, tiktok #161823, youtube #FF0000), so a real mark and
 * a drawn glyph land on the same hue either way. The drawn two use
 * `currentColor` so a recolour still reaches them.
 */

/** Cropped out of the Figma lockups — the mark, without the wordmark. */
const REAL: Partial<Record<string, string>> = {
  meta: metaMark,
  tiktok: tiktokMark,
  youtube: youtubeMark,
  paidSearch: googleAdsMark,
};

export interface ChannelMarkProps {
  channel: ChannelName | 'all';
  size?: number;
  /** Marks sit beside the channel name, so they are decorative by default. */
  title?: string;
}

/**
 * `all` is not a channel, so it must not borrow a channel's colour.
 *
 * CSS_CHANNEL has no `all` key, so the old `?? 'meta'` fallback painted the
 * aggregate view in META BLUE -- the roll-up of six channels wearing the brand
 * of one of its own members. The fallback was matching on absence rather than
 * meaning, which is the same shape as every other token bug in this project.
 */
function colourFor(channel: string): string {
  if (channel === 'all') return 'var(--accent-base)';
  return `var(--channel-${CSS_CHANNEL[channel]})`;
}

const PATHS: Record<string, ReactNode> = {
  meta: (
    <path d="M3.2 8c0-1.6 1-2.7 2.3-2.7 1 0 1.7.6 2.5 2.7s1.5 2.7 2.5 2.7c1.3 0 2.3-1.1 2.3-2.7s-1-2.7-2.3-2.7c-1 0-1.7.6-2.5 2.7S6.5 10.7 5.5 10.7C4.2 10.7 3.2 9.6 3.2 8Z"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
  ),
  tiktok: (
    <>
      <path d="M9.3 2.2v7.5a2.35 2.35 0 1 1-1.9-2.3" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M9.3 2.2c.25 1.7 1.55 2.85 3.2 2.95" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  youtube: (
    <>
      <rect x="1.6" y="3.6" width="12.8" height="8.8" rx="2.6" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M6.9 6.35 10.3 8l-3.4 1.65V6.35Z" fill="currentColor" />
    </>
  ),
  affiliates: (
    <>
      <path d="M6.7 9.3a2.6 2.6 0 0 1 0-3.7l1.5-1.5a2.6 2.6 0 0 1 3.7 3.7l-.75.75"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M9.3 6.7a2.6 2.6 0 0 1 0 3.7l-1.5 1.5a2.6 2.6 0 0 1-3.7-3.7l.75-.75"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </>
  ),
  paidSearch: (
    <>
      <circle cx="7.1" cy="7.1" r="3.9" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="m10.2 10.2 3.1 3.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  podcasts: (
    <>
      <rect x="6.2" y="1.8" width="3.6" height="7.2" rx="1.8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M4.1 7.5a3.9 3.9 0 0 0 7.8 0M8 11.5V14" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" fill="none" />
    </>
  ),
  /* "All channels" is not a channel and has no mark. A filled dot in the accent
     colour reads as a total rather than a seventh source. */
  all: <circle cx="8" cy="8" r="4" fill="currentColor" />,
};


export function ChannelMark({ channel, size = 16, title }: ChannelMarkProps) {
  const real = REAL[channel];
  if (real) {
    return (
      /* Boxed and contained rather than sized directly: the four marks have
         four different aspect ratios, so setting one dimension makes them
         disagree on the other and the column edge goes ragged. */
      <span
        className="gr-chmark"
        style={{ width: size, height: size }}
        role={title ? 'img' : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : true}
      >
        <img src={real} alt="" />
      </span>
    );
  }

  const glyph = PATHS[channel] ?? PATHS.all;
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16"
      style={{ color: colourFor(channel), flex: 'none', display: 'block' }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {glyph}
    </svg>
  );
}
