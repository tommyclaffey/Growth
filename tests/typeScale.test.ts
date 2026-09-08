import { readFileSync, readdirSync, type Dirent } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/* Lives in tests/ rather than src/ ON PURPOSE.

   tsconfig.app.json sets types to vite/client only, which is what stops browser
   code importing 'node:fs'. That is a real safety property, so this test moved
   out from under it rather than the app's config being widened to accommodate
   one file. tsconfig.node.json already has node types and now covers tests/.

   Resolved from THIS file rather than process.cwd(), so it does not depend on
   where the runner was started. */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e: Dirent) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(tsx|css)$/.test(e.name) ? [p] : [];
  });
}

const SCALE = new Set(
  [...readFileSync(join(SRC, 'styles/type.css'), 'utf8')
    .matchAll(/\.(gr-type-[a-z-]+)\s*[,{]/g)].map((m) => m[1]),
);

describe('type scale', () => {
  /**
   * A typo'd type class is invisible in review and silent at runtime: the
   * element simply inherits, renders at the browser default, and looks
   * "slightly off" rather than broken. TypeScript cannot see inside a
   * className string, so this is the only place it can be caught.
   */
  it('every gr-type-* class used anywhere is one the scale actually defines', () => {
    const bad: string[] = [];
    for (const file of walk(SRC)) {
      if (file.endsWith('type.css')) continue;
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bgr-type-[a-z-]+/g)) {
        if (!SCALE.has(m[0])) bad.push(`${file.replace(SRC, 'src')}: ${m[0]}`);
      }
    }
    expect(bad, `undefined type classes:\n${bad.join('\n')}`).toEqual([]);
  });

  it('has the four steps the creative card builds its hierarchy from', () => {
    for (const c of ['gr-type-strip', 'gr-type-body', 'gr-type-caption', 'gr-type-overline']) {
      expect(SCALE.has(c), c).toBe(true);
    }
  });

  /* `font: inherit` is a RESET, not a type declaration -- it is how a <button>
     stops wearing the browser's UI font and starts wearing the page's. Counting
     it would make the check punish the correct thing. */
  function rawType(file: string): string[] {
    const text = readFileSync(file, 'utf8');
    return [...text.matchAll(/^\s*(?:font-size|font)\s*:\s*([^;]+);/gm)]
      .map((m) => m[1].trim())
      .filter((v) => v !== 'inherit');
  }

  const cssFiles = walk(SRC).filter((f) => f.endsWith('.css') && !f.endsWith('type.css'));

  it('declares no type at all in the creative components', () => {
    const creative = cssFiles.filter((f) => f.includes('CreativeCard'));
    expect(creative.length).toBeGreaterThan(0);
    for (const f of creative) expect(rawType(f), f.replace(SRC, 'src')).toEqual([]);
  });

  /**
   * A RATCHET, not a clean bill of health.
   *
   * Seven declarations predate this check. Some are legitimate -- a 14px "x" or a
   * 20px caret is GLYPH geometry, the same argument as the 242 icon radii the
   * Figma audit correctly refused to tokenise. Some are real debt: Button's
   * bare 13px has an exact scale equivalent in gr-type-label-button.
   *
   * Sorting that out is not this test's job. Stopping the number from growing
   * is. Failing loudly at seven is worth far more than a TODO nobody reads, and
   * the number can only be lowered.
   */
  it('does not add new raw type declarations — baseline 7, and only downward', () => {
    const found = cssFiles.flatMap((f) => rawType(f).map((v) => `${f.replace(SRC, 'src')}: ${v}`));
    expect(found.length, `raw type declarations:\n${found.join('\n')}`).toBeLessThanOrEqual(7);
  });
});
