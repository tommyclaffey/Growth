import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Installable (roadmap step 4, Oct 4). Chrome's own check reported zero
 * installability errors on the built app; this keeps the pieces it needs
 * from being lost in a refactor.
 */
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
const sw = readFileSync('public/sw.js', 'utf8');
const html = readFileSync('index.html', 'utf8');

describe('the installable app', () => {
  it('the manifest names Growth, opens full screen inside /Growth/, and every icon exists', () => {
    expect(manifest.short_name).toBe('Growth');
    expect(manifest.display).toBe('standalone');
    expect(manifest.scope).toBe('/Growth/');
    expect(manifest.start_url.startsWith('/Growth/')).toBe(true);
    const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
    for (const i of manifest.icons) expect(existsSync(`public/${i.src}`), i.src).toBe(true);
    expect(existsSync('public/icons/apple-touch-icon.png')).toBe(true);
  });

  it('index.html links the manifest and lets the layout reach the safe areas', () => {
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/);
    expect(html).toMatch(/viewport-fit=cover/);
    expect(html).toMatch(/apple-touch-icon/);
  });

  it('⚠️ the service worker never caches live data, and pages are network-first', () => {
    expect(sw).toMatch(/\/api\//);
    expect(sw).toMatch(/req\.mode === 'navigate'[\s\S]*fetch\(req\)[\s\S]*\.catch/);
  });
});
