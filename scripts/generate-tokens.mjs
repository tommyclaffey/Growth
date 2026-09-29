#!/usr/bin/env node
/**
 * tokens/tokens.json  ->  src/styles/tokens.css
 *
 * ⭐ The artifact behind the case study's central claim: the design system in
 * code is GENERATED from one source, so it cannot drift from itself.
 *
 * Run:   node scripts/generate-tokens.mjs          (writes the CSS)
 *        node scripts/generate-tokens.mjs --check  (exits 1 if the CSS is stale)
 *
 * `tests/tokens.test.ts` runs the check on every test run, so a hand edit to
 * tokens.css fails CI instead of silently becoming the new truth -- which is
 * exactly what happened twice before this script existed (Sept 3, Sept 7).
 *
 * ⚠️ HONEST PROVENANCE. tokens.json was seeded from the Figma variables of file
 * b6JvDQQ7QcWJpckvZyAbjm on Aug 26, 2026, and has since taken documented fixes
 * (WCAG contrast, Sept 3 and Sept 28) that Figma does not yet have. Figma's
 * Variables REST API is Enterprise-only, so the pull is not automated: a sync
 * is an export from the Figma file into tokens.json, then this script. Until
 * that sync runs, THIS file is the source of truth and Figma is behind it.
 *
 * Shape of tokens.json:
 *   { $header, blocks: [{ selector, notes[], items: [
 *       { name, value } | { name, ref } | { comment }, optional note ] }] }
 * A `ref` is another token's name and is emitted as var(--ref) -- the tier
 * rule (semantics alias primitives) is a property of the data, not of layout.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'tokens/tokens.json');
const OUT = resolve(ROOT, 'src/styles/tokens.css');

export function render(data) {
  const lines = [`/*${data.$header}*/`, ''];
  for (const block of data.blocks) {
    for (const n of block.notes) lines.push(`/*${n}*/`);
    lines.push(`${block.selector.replace(', ', ',\n')} {`);
    const width = Math.max(...block.items.filter((i) => i.name).map((i) => i.name.length)) + 3;
    for (const item of block.items) {
      if (item.comment !== undefined) {
        lines.push(`  /*${item.comment}*/`);
        continue;
      }
      const value = item.ref ? `var(--${item.ref})` : item.value;
      const decl = `  ${`--${item.name}:`.padEnd(width)} ${value};`;
      lines.push(item.note !== undefined ? `${decl}   /*${item.note}*/` : decl);
    }
    lines.push('}', '');
  }
  return lines.join('\n');
}

/** Every declared name, per block -- for the drift and tier tests. */
export function load() {
  return JSON.parse(readFileSync(SRC, 'utf8'));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const css = render(load());
  if (process.argv.includes('--check')) {
    const current = readFileSync(OUT, 'utf8');
    if (current !== css) {
      console.error('tokens.css is out of date with tokens/tokens.json. Run: node scripts/generate-tokens.mjs');
      process.exit(1);
    }
    console.log('tokens.css is up to date.');
  } else {
    writeFileSync(OUT, css);
    console.log(`Wrote ${OUT}`);
  }
}
