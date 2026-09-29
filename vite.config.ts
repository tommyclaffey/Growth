import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

import { assistantApi } from './server/assistantApi.js'
import { channelOauth } from './server/channelOauth.js'
import { slackApi } from './server/slackApi.js'
import { metaApi } from './server/metaApi.js'
import { googleApi } from './server/googleAdsApi.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  /* Vite only exposes VITE_-prefixed vars, and only to the client — which is
     right: a key the browser can read is a public key. Load .env.local here so
     the DEV SERVER can see ANTHROPIC_API_KEY while the bundle never does. */
  const env = loadEnv(mode, process.cwd(), '')
  /* 🐛 Every key the server reads must be listed here. The ad-platform ids were
     not -- so putting META_CLIENT_ID in .env.local, exactly as the setup steps
     say, did nothing, and Connect kept reporting "needs an app registration". */
  for (const k of [
    'ANTHROPIC_API_KEY', 'SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET', 'SLACK_REDIRECT_URI', 'SLACK_SIGNING_SECRET',
    'META_CLIENT_ID', 'META_CLIENT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
    'GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_API_VERSION',
    'TIKTOK_APP_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET',
  ]) {
      if (env[k]) process.env[k] = env[k]
    }

  return {
    plugins: [react(), assistantApi(), slackApi(), channelOauth(), metaApi(), googleApi()],
    /* Served from https://tommyclaffey.github.io/Growth/, so assets need the
       repo name as their base path. Without this, the built index.html asks for
       /assets/... at the domain root, gets GitHub's 404 page back, and renders
       blank with no console error that points at the cause. */
    base: '/Growth/',
    server: {
      /* Vite rejects requests whose Host header it does not recognise — a real
         protection against DNS rebinding, and the reason the tunnel returned
         403 rather than the app. The tunnel is a legitimate front door, so name
         it. Scoped to the tunnel domain, not opened to everything. */
      allowedHosts: ['.trycloudflare.com'],
    },
  }
})
