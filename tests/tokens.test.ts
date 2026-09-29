import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs script, imported for its pure functions
import { load, render } from '../scripts/generate-tokens.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Item { name?: string; ref?: string; value?: string; comment?: string }
interface Block { selector: string; items: Item[] }
const data = load() as { blocks: Block[] };
const block = (sel: string) => data.blocks.find((b) => b.selector === sel)!;
const PRIMS = block(':root');
const THEMES = {
  light: block(":root, [data-theme='light']"),
  dark: block("[data-theme='dark']"),
};

describe('tokens are generated, not hand-edited', () => {
  it('tokens.css is exactly what tokens.json generates', () => {
    /* tokens.css claimed "GENERATED FROM FIGMA. DO NOT EDIT BY HAND" and was
       hand-edited twice. Now a hand edit fails here. */
    const css = readFileSync(resolve(ROOT, 'src/styles/tokens.css'), 'utf8');
    expect(css === render(data), 'run: node scripts/generate-tokens.mjs').toBe(true);
  });

  it('the tier rule holds: every semantic token aliases a primitive, never a raw value', () => {
    const prims = new Set(PRIMS.items.filter((i) => i.name).map((i) => i.name));
    for (const [theme, b] of Object.entries(THEMES)) {
      for (const i of b.items.filter((x) => x.name)) {
        expect(i.ref, `${theme} --${i.name} is a raw value`).toBeDefined();
        expect(prims.has(i.ref!), `${theme} --${i.name} -> --${i.ref} is not a primitive`).toBe(true);
      }
    }
  });

  it('both themes define the same semantic names', () => {
    const names = (b: Block) => b.items.filter((i) => i.name).map((i) => i.name).sort();
    expect(names(THEMES.dark)).toEqual(names(THEMES.light));
  });
});

/* ---------- contrast, computed from the tokens themselves ---------- */

function hex(theme: 'light' | 'dark', name: string): string {
  const sem = THEMES[theme].items.find((i) => i.name === name);
  const prim = PRIMS.items.find((i) => i.name === (sem?.ref ?? name));
  const v = prim?.value;
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${theme} --${name} does not resolve to a hex`);
  return v;
}
function lum(h: string) {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** [foreground, background, minimum] -- 4.5 for text, 3 for icons and marks. */
const PAIRS: [string, string, number][] = [
  ...['text-primary', 'text-secondary', 'text-muted'].flatMap((t) =>
    ['surface-card', 'surface-card-tint', 'surface-page-top', 'surface-page-bottom']
      .map((s) => [t, s, 4.5] as [string, string, number])),
  ['accent-text', 'surface-card', 4.5],
  ['accent-text', 'accent-tint', 4.5],
  ['semantic-good', 'semantic-good-bg', 4.5],
  ['semantic-bad', 'semantic-bad-bg', 4.5],
  ['semantic-warn', 'semantic-warn-bg', 4.5],
  /* White on every accent surface that carries a label. */
  ['brand-on-accent', 'accent-fill', 4.5],
  ['brand-on-accent', 'accent-gradient-top', 4.5],
  ['brand-on-accent', 'accent-gradient-bottom', 4.5],
  ['brand-on-accent', 'avatar-1', 4.5],
  ['brand-on-accent', 'avatar-2', 4.5],
  ['brand-on-accent', 'avatar-3', 4.5],
  /* Icons and controls: 3:1 (WCAG 1.4.11). */
  ['icon-default', 'surface-card', 3],
  ['icon-muted', 'surface-card', 3],
  ['focus-ring', 'surface-card', 3],
];

describe('WCAG AA contrast, both themes, measured from tokens.json', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const [fg, bg, min] of PAIRS) {
      it(`${theme}: --${fg} on --${bg} >= ${min}:1`, () => {
        const r = contrast(hex(theme, fg), hex(theme, bg));
        expect(Math.round(r * 100) / 100).toBeGreaterThanOrEqual(min);
      });
    }
  }
});
