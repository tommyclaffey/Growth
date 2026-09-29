/* Runs INSIDE the page (via CDP Runtime.evaluate) -- see scripts/audit-contrast.mjs. Returns failures. */
const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
function bgOf(el) {
  const layers = [];
  for (let n = el; n; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.backgroundImage && cs.backgroundImage !== 'none' && !cs.backgroundImage.startsWith('url')) {
      const cols = [...cs.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0]));
      if (cols.length) { layers.push({ grad: cols }); break; }
    }
    const c = parse(cs.backgroundColor);
    if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
  }
  let base = { r: 255, g: 255, b: 255, a: 1 };
  const out = [];
  const last = layers[layers.length - 1];
  const bases = last && last.grad ? last.grad.map((g) => ({ ...g, a: 1 })) : [last && last.a >= 1 ? last : base];
  for (const b0 of bases) {
    let acc = b0;
    for (let i = layers.length - (last && (last.grad || last.a >= 1) ? 2 : 1); i >= 0; i--) if (!layers[i].grad) acc = blend(layers[i], acc);
    out.push(acc);
  }
  return out;
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const fails = []; const seen = new Set();
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (walker.nextNode()) {
  const t = walker.currentNode; if (!t.textContent.trim()) continue;
  const el = t.parentElement; const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') continue;
  let op = 1; for (let n = el; n; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
  if (op < 0.99) continue; // hover-revealed controls; checked when shown
  if (el.closest('button:disabled, [aria-disabled="true"], .gr-sr-only')) continue;
  const fg = parse(cs.color); if (!fg) continue;
  const size = parseFloat(cs.fontSize); const weight = Number(cs.fontWeight);
  const large = size >= 24 || (size >= 18.66 && weight >= 700);
  const need = large ? 3 : 4.5;
  for (const bg of bgOf(el)) {
    const f = fg.a < 1 ? blend(fg, bg) : fg;
    const cr = ratio(f, bg);
    if (cr < need) {
      const key = `${cs.color}|${bg.r},${bg.g},${bg.b}|${el.className}`;
      if (seen.has(key)) continue; seen.add(key);
      fails.push({ text: t.textContent.trim().slice(0, 40), cls: String(el.className).slice(0, 60), ratio: Math.round(cr * 100) / 100, need, size, fg: cs.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})` });
    }
  }
}
return fails;
