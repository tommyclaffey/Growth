// Growth in production (Railway) -- roadmap step 3, Oct 5 2026.
//
// ⭐ The same server, not a second one. Every /api route is a Vite plugin
// (server/*.ts) that runs inside the dev server on Tommy's Mac. Rewriting them
// for production would be a second copy of every route, guard and token store
// -- two copies that drift. Instead this boots Vite in MIDDLEWARE MODE, which
// runs those exact plugins (and `ssrLoadModule`, which the API uses to load
// the dashboard's own data layer), and puts it behind a plain HTTP server that:
//
//   /api/*      -> the plugins, guard first (session, origin, secret files)
//   /healthz    -> 200, for Railway's health check
//   /demo       -> the public demo account (GROWTH_PUBLIC_DEMO=1)
//   /           -> redirect to /Growth/ (the app's base path)
//   /Growth/*   -> the BUILT app from dist/, with the SPA fallback
//
// Nothing else reaches Vite, so source files and dotfiles are never served.
import { createServer as createHttp } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createServer as createVite } from 'vite';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const BASE = '/Growth/';
const PORT = Number(process.env.PORT) || 8080;

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/ is missing -- run `npm run build` first.');
  process.exit(1);
}

const vite = await createVite({
  root: ROOT,
  configFile: join(ROOT, 'vite.config.ts'),
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  logLevel: 'warn',
});

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
};

/* Security headers on everything this server answers itself. */
function harden(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

function sendFile(res, file) {
  const ext = extname(file);
  res.statusCode = 200;
  res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
  /* Hashed build assets never change; everything else is re-checked. */
  res.setHeader('Cache-Control', file.includes(`${join(DIST, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
  createReadStream(file).pipe(res);
}

function serveApp(req, res) {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.statusCode = 400; return res.end(); }
  const rel = normalize(path.slice(BASE.length)).replace(/^(\.\.(\/|\\|$))+/, '');
  const file = join(DIST, rel);
  /* Inside dist/, no dotfiles, a real file -- or the app shell. */
  if (file.startsWith(DIST) && !/(^|\/)\./.test(rel) && existsSync(file) && statSync(file).isFile()) return sendFile(res, file);
  return sendFile(res, join(DIST, 'index.html'));
}

const http = createHttp((req, res) => {
  harden(res);
  const url = req.url ?? '/';
  if (url === '/healthz') { res.statusCode = 200; return res.end('ok'); }
  if (url.startsWith('/api/') || url === '/api') {
    return vite.middlewares(req, res, () => { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); res.end('{"error":"Not found."}'); });
  }
  if (url === '/' || url === '/Growth') { res.statusCode = 302; res.setHeader('Location', BASE); return res.end(); }
  /* The shareable demo link (Oct 7): signs in as Maya at Northbank, sandboxed. */
  if (url === '/demo' || url === '/demo/') { res.statusCode = 302; res.setHeader('Location', '/api/auth/demo'); return res.end(); }
  if (url.startsWith(BASE)) return serveApp(req, res);
  res.statusCode = 404; res.end('Not found');
});

http.listen(PORT, '0.0.0.0', () => console.log(`Growth listening on :${PORT}`));
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { http.close(); vite.close().finally(() => process.exit(0)); });
}
