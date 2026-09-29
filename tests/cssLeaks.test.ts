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

/**
 * A rule written to override a reset has to actually win the cascade.
 *
 * 🐛 `.gr-table td:last-child { padding-right: 0 }` exists so a column of
 * numbers reads flush to the card's inner edge — correct, and the reason the
 * figures line up. `.gr-table__ask { padding-right: 16px }` was written to pull
 * the Ask button away from that edge and did nothing at all: 0-2-1 beats 0-1-0,
 * so the reset won and the button stayed flush.
 *
 * ⚠️ Nothing about that failure is visible in the source. The declaration is
 * there, the value is right, the property is correct, and the build is clean.
 * It took someone looking at the screen and saying it "looks like a mistake".
 *
 * So: any rule that sets padding on the ask cell must name the element as well
 * as the class, which is what gets it past the reset.
 */
describe('cell overrides out-specify the last-child reset', () => {
  const files = walk(SRC);

  it('ask-cell padding is declared at a specificity that wins', () => {
    const declaring = files.flatMap((f) => {
      const css = readFileSync(f, 'utf8');
      /* Selector blocks that set padding-right AND mention the ask cell. */
      return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
        .filter(([, sel, body]) =>
          sel.includes('gr-table__ask') && /padding(-right)?\s*:/.test(body))
        .map(([, sel]) => sel.trim());
    });

    expect(declaring.length, 'no rule sets padding on the ask cell').toBeGreaterThan(0);

    for (const sel of declaring) {
      /* `td.gr-table__ask` or `th.gr-table__ask` — an element plus the class,
         which clears `.gr-table td:last-child`. A bare `.gr-table__ask` does
         not, and that is the bug this guards. */
      expect(sel, `"${sel}" cannot out-specify .gr-table td:last-child`)
        .toMatch(/\b(td|th)\.gr-table__ask/);
    }
  });
});

/**
 * 🐛 Three times now: a rule set `font: inherit` on a class that the markup ALSO
 * gives a `gr-type-*` class. The rule wins (component CSS loads after type.css),
 * the type class silently does nothing, and the element takes whatever font its
 * parent has -- the Ask button at body size beside caption text, the Assistant's
 * decision button, and "Flag for attention" at the 17px of the title beside it.
 *
 * Nothing is wrong in either file alone, which is why it keeps getting through.
 */
describe('a type class is never overridden by font: inherit', () => {
  it('no class that carries font: inherit is also given a gr-type-* class', () => {
    /* Its own walk: the file's `walk` returns CSS only, and the first version of
       this test used it for the markup too -- so it scanned zero .tsx files and
       passed with the bug put back. Verified failing before it was trusted. */
    const all = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap((e: Dirent) => (e.isDirectory() ? all(join(dir, e.name)) : [join(dir, e.name)]));
    const css = all(SRC).filter((f) => f.endsWith('.css'));
    const tsx = all(SRC).filter((f) => f.endsWith('.tsx'));
    expect(tsx.length).toBeGreaterThan(20);
    const inheriting = new Set<string>();
    for (const f of css) {
      for (const [, sel, body] of readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
        .matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        if (!/(^|;|\s)font\s*:\s*inherit/.test(body)) continue;
        for (const part of sel.split(',')) {
          const last = part.trim().split(/\s+/).pop() ?? '';
          const cls = last.match(/\.([\w-]+)/g)?.pop()?.slice(1);
          if (cls && !cls.startsWith('gr-type-')) inheriting.add(cls);
        }
      }
    }
    const clashes: string[] = [];
    for (const f of tsx) {
      for (const [, names] of readFileSync(f, 'utf8').matchAll(/className=\{?[`"]([^`"]*)[`"]/g)) {
        const list = names.split(/\s+/);
        if (!list.some((n) => n.startsWith('gr-type-'))) continue;
        for (const n of list) if (inheriting.has(n)) clashes.push(`${n} in ${f.split('/src/')[1]}`);
      }
    }
    expect(clashes).toEqual([]);
  });
});
