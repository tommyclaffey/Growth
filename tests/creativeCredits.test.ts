import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* Every stock photo in the ad library names its photographer and source
   (Oct 12 2026). A new file without a credit line fails here. */
describe('creative asset credits', () => {
  it('lists every photo in CREDITS.md', () => {
    const dir = join(__dirname, '..', 'src', 'assets', 'creative');
    const credits = readFileSync(join(dir, 'CREDITS.md'), 'utf8');
    const photos = readdirSync(dir).filter((f) => f.endsWith('.jpg') && f !== 'ad.jpg');
    expect(photos.length).toBe(18);
    for (const f of photos) expect(credits, f).toContain(f);
  });
});
