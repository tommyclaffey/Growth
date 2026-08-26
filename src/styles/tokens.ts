/* ============================================================
   Growth — Design Tokens (typed)
   GENERATED FROM FIGMA. DO NOT EDIT BY HAND.

   Source file : b6JvDQQ7QcWJpckvZyAbjm
   Generated   : 2026-08-26

   These are CSS variable REFERENCES, not hex values. The values live in
   tokens.css and switch with [data-theme]. If this file held hex codes,
   dark mode would break and the two files would drift.
   ============================================================ */

export const color = {
  text: {
    primary: 'var(--text-primary)',
    secondary: 'var(--text-secondary)',
    muted: 'var(--text-muted)',
    disabled: 'var(--text-disabled)',
  },
  surface: {
    pageTop: 'var(--surface-page-top)',
    pageBottom: 'var(--surface-page-bottom)',
    card: 'var(--surface-card)',
    cardTint: 'var(--surface-card-tint)',
    disabled: 'var(--surface-disabled)',
    skeleton: 'var(--surface-skeleton)',
  },
  border: {
    default: 'var(--border-default)',
    strong: 'var(--border-strong)',
    subtle: 'var(--border-subtle)',
    disabled: 'var(--border-disabled)',
  },
  accent: {
    base: 'var(--accent-base)',
    text: 'var(--accent-text)',
    soft: 'var(--accent-soft)',
    tint: 'var(--accent-tint)',
    gradientTop: 'var(--accent-gradient-top)',
    gradientBottom: 'var(--accent-gradient-bottom)',
    onAccent: 'var(--brand-on-accent)',
  },
  focus: {
    ring: 'var(--focus-ring)',
    ringOffset: 'var(--focus-ring-offset)',
  },
  icon: {
    default: 'var(--icon-default)',
    muted: 'var(--icon-muted)',
    active: 'var(--icon-active)',
    activeSoft: 'var(--icon-active-soft)',
    onAccent: 'var(--icon-on-accent)',
  },
  semantic: {
    good: 'var(--semantic-good)',
    goodBg: 'var(--semantic-good-bg)',
    bad: 'var(--semantic-bad)',
    badBg: 'var(--semantic-bad-bg)',
    warn: 'var(--semantic-warn)',
    warnBg: 'var(--semantic-warn-bg)',
  },
} as const;

/** Channel identity. `soft` is the shaded bottom stop of a bar gradient. */
export const channel = {
  meta:        { base: 'var(--channel-meta)',        soft: 'var(--channel-meta-soft)' },
  tiktok:      { base: 'var(--channel-tiktok)',      soft: 'var(--channel-tiktok-soft)', lift: 'var(--channel-tiktok-lift)' },
  youtube:     { base: 'var(--channel-youtube)',     soft: 'var(--channel-youtube-soft)' },
  affiliates:  { base: 'var(--channel-affiliates)',  soft: 'var(--channel-affiliates-soft)' },
  paidSearch:  { base: 'var(--channel-paid-search)', soft: 'var(--channel-paid-search-soft)' },
  podcasts:    { base: 'var(--channel-podcasts)',    soft: 'var(--channel-podcasts-soft)' },
} as const;

export type ChannelName = keyof typeof channel;

export const space = {
  2: 'var(--space-2)',   4: 'var(--space-4)',   6: 'var(--space-6)',
  8: 'var(--space-8)',  10: 'var(--space-10)', 12: 'var(--space-12)',
  14: 'var(--space-14)', 16: 'var(--space-16)', 18: 'var(--space-18)',
  20: 'var(--space-20)', 24: 'var(--space-24)', 28: 'var(--space-28)',
  30: 'var(--space-30)', 40: 'var(--space-40)', 48: 'var(--space-48)',
} as const;

export const radius = {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)',
  '2xl': 'var(--radius-2xl)',
  pill: 'var(--radius-pill)',
} as const;

export const borderWidth = {
  none: 'var(--border-width-none)',
  sm: 'var(--border-width-sm)',
  md: 'var(--border-width-md)',
} as const;

export const elevation = {
  raised: 'var(--elevation-raised)',
  card: 'var(--elevation-card)',
  header: 'var(--elevation-header)',
  menu: 'var(--elevation-menu)',
  glowSoft: 'var(--glow-accent-soft)',
  glow: 'var(--glow-accent)',
  glowStrong: 'var(--glow-accent-strong)',
} as const;

/**
 * The bar gradient used in every chart.
 * Light at the top, deeper at the bottom, because the top edge is the data
 * and it needs to stay the strongest part of the shape.
 */
export function channelGradient(name: ChannelName): string {
  const c = channel[name];
  const top = 'lift' in c ? c.lift : c.base;
  return `linear-gradient(to bottom, ${top}, ${c.soft})`;
}

export type Theme = 'light' | 'dark';
