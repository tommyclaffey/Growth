import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * "Which channels are on" has ONE door. `channels.ts` owns the saved choice and
 * pushes it into `metrics.ts`. A second caller of setActiveChannels, or a
 * component reading activeChannels() without subscribing, is how the screen and
 * Settings end up disagreeing. App.tsx is the root and subscribes itself.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : files(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}
const SRC = files('src');

describe('one door for the channel list', () => {
  it('only channels.ts sets it', () => {
    const callers = SRC.filter((f) => /setActiveChannels\(/.test(readFileSync(f, 'utf8')))
      .filter((f) => !f.endsWith('data/metrics.ts'));
    expect(callers).toEqual(['src/data/channels.ts']);
  });

  it('components and screens read it through useChannels()', () => {
    const readers = SRC.filter((f) => /src\/(components|screens)\//.test(f))
      .filter((f) => /activeChannels\(\)/.test(readFileSync(f, 'utf8')));
    expect(readers).toEqual([]);
  });
});
