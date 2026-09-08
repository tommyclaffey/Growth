/**
 * Rasterises every brand asset so they can be LOOKED AT.
 *
 * This exists because three separate "the logo is broken" reports were debugged
 * by reading SVG source and reasoning about viewBoxes, which is guessing. Two
 * of the three diagnoses were wrong. An SVG is a picture; the only way to know
 * what it looks like is to render it.
 *
 *   npm run brand:check   ->  brand-check.png
 */
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const DIR = 'src/assets/brand';
const BOX = 160;
const files = readdirSync(DIR).filter((f) => f.endsWith('.svg')).sort();

const cells = files.map((f, i) => {
  const svg = readFileSync(`${DIR}/${f}`, 'utf8');
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const vb = /viewBox="([^"]+)"/.exec(svg)[1];
  const col = i % 5, row = Math.floor(i / 5);
  const x = 20 + col * (BOX + 20), y = 20 + row * (BOX + 44);
  /* Contained in a square, exactly as ChannelMark boxes it — so this sheet
     shows what the app shows, not what the file looks like on its own. */
  const bg = f.includes('dark') ? '#16161C' : '#EEEEF4';
  return `<rect x="${x}" y="${y}" width="${BOX}" height="${BOX}" fill="${bg}"/>
  <svg x="${x}" y="${y}" width="${BOX}" height="${BOX}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${inner}</svg>
  <text x="${x + BOX / 2}" y="${y + BOX + 22}" font-family="Inter,sans-serif" font-size="13"
        fill="#5A5A68" text-anchor="middle">${f.replace('.svg', '')}</text>`;
}).join('\n');

const rows = Math.ceil(files.length / 5);
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${20 + 5 * (BOX + 20)}" height="${20 + rows * (BOX + 44)}">
<rect width="100%" height="100%" fill="#FFFFFF"/>${cells}</svg>`;

writeFileSync('brand-check.png', new Resvg(sheet, { fitTo: { mode: 'width', value: 1100 } }).render().asPng());
console.log(`brand-check.png — ${files.length} assets`);
