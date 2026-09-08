import { readFileSync, readdirSync, type Dirent } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e: Dirent) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : (e.name.endsWith('.css') ? [p] : []);
  });
}

/**
 * object-fit is the dangerous one, and this is not hypothetical.
 *
 * `.gr-cpreview__art img { object-fit: cover }` was written for the campaign
 * artwork. As a DESCENDANT selector it also matched the <img> inside the
 * ChannelMark that the same band renders in its empty state -- equal
 * specificity, later in source order, so it won. The Meta logo was cropped to a
 * square by a rule meant for photographs, two components away.
 *
 * It survived three attempts to fix it, all of which examined the SVG and the
 * mark component. Neither was ever wrong.
 *
 * A cropping rule must therefore name what it crops: either a class of its own,
 * or `>` so it cannot reach past the element the component owns. Other
 * descendant selectors are left alone -- `.card p` is fine, because a <p> is
 * not something another component renders inside yours and then has ruined.
 */
describe('cropping rules cannot reach into nested components', () => {
  it('every object-fit rule is scoped by class or child combinator', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8');
      /* Selector block immediately preceding an object-fit declaration. */
      for (const m of text.matchAll(/([^{}]+)\{[^{}]*object-fit\s*:[^{}]*\}/g)) {
        const sel = m[1].split(/[;}]/).pop()!.trim().replace(/\/\*[\s\S]*?\*\//g, '').trim();
        /* Bad shape: `.something img` with only whitespace between them. */
        if (/\.[a-zA-Z0-9_-]+\s+(img|svg|video|picture)\b/.test(sel)) {
          offenders.push(`${file.replace(SRC, 'src')}: ${sel}`);
        }
      }
    }
    expect(offenders, `cropping rules that can reach a nested component:\n${offenders.join('\n')}`)
      .toEqual([]);
  });
});
