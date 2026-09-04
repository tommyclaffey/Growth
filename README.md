# Growth

A marketing analytics dashboard, built as a working React + TypeScript product
rather than a set of screens — six views, 29 components, a Slack integration
that posts and receives real messages, and an assistant that answers questions
about the data.

> **Live:** [tommyclaffey.github.io/Growth](https://tommyclaffey.github.io/Growth/) ·
> **Case study:** [tommyclaffey.com/portfolio/growth](https://tommyclaffey.com/portfolio/growth) ·
> **Figma:** `b6JvDQQ7QcWJpckvZyAbjm`

---

## Why this exists

A design system in Figma is a claim. The same system rendering in code is
evidence.

The Figma file has 31 components and a three-tier token architecture. This
repository is that system implemented — same tokens, same component contracts,
same states — plus enough product around it to prove the components work under
real conditions rather than on a swatch page.

**The parts worth reviewing are the failures**, not the screens. They are
documented below and in the commit history, which is written to be read.

---

## What it does

| Area | |
|---|---|
| **Overview** | Blended KPIs, pace-to-target, needs-attention strip, channel table |
| **Channels** | Per-channel spend, leads, CAC, ROAS across six channels and three ranges |
| **Campaigns** | Expandable campaign → ad-set hierarchy |
| **Reports · Notifications · Settings** | Saved reports, an alert feed, channel and account management |
| **Chat** | Team conversations, DMs and group messages, mirrored to a real Slack channel |
| **Assistant** | Natural-language questions over the data — Claude when configured, a deterministic local engine otherwise |
| **Export** | CSV of the current view |

**The data is seeded, not live.** A seeded PRNG generates 90 days per channel,
normalised so totals land on the figures the design was built around. There is
no ad-platform API behind it — `Connect` in Settings starts a real OAuth
handoff and stops there, deliberately, rather than faking a connection.

---

## The token layer

Three tiers, mirroring the Figma structure.

| Tier | What it holds |
|---|---|
| **Primitives** | raw values — `--violet-500: #635BFF` |
| **Semantic** | roles — `--accent-base: var(--violet-500)` |
| **Scale** | 24 spacing, radius and border-width steps |

**220 declarations, 117 of which are aliases** — so most of the system points at
something else rather than restating a value.

**The rule: a component that reaches past the semantic tier into a primitive is
a bug.** That is what makes a rebrand a one-line change.

`tokens.ts` exports **CSS variable references, not hex codes**. If it held
values, dark mode would break and the two files would drift within a week.

⚠️ **The tokens were exported from Figma via the plugin API, but the export
step is not committed as a runnable script.** The values are not hand-typed;
regenerating them today means re-running the export by hand. Until that script
is in this repo, "the tokens cannot drift" is a weaker claim than it sounds —
it is true of how they were made, not of how they are maintained.

---

## Three defects worth reading

**Aliasing the semantic layer set every shadow to 100% opacity.** Primitives
were created as `{r, g, b}`; Figma defaults a missing alpha to 1. A shadow token
is `#1A1A2E` at ~6%, so the RGB matched exactly and the verification passed —
it compared colour and ignored alpha. It reported "41 aliased, 0 drift" while
cards and menus rendered with heavy black drop shadows.

> A green check on a partial assertion is more dangerous than no check at all,
> because it stops anyone from looking.

**An auto-binder filled 17 icon containers white.** It matched on value
(`#FFFFFF`) without checking role. A white container and a white input surface
are the same hex and opposite intents; the icons were drawn as white strokes on
the vectors inside, so they vanished. Of the five components that pass touched,
three broke — and it reported success.

**Two "disabled" tokens resolved to the same hex as normal UI.** A disabled
control was communicated by nothing a user could see. Found by a duplicate-value
sweep, not by looking.

Each of these is the same shape: **a check that measured what was stored rather
than what was true.**

---

## Slack

Real OAuth, real messages, two directions.

- Posts from Growth appear in a Slack channel; replies come back into Growth
- DMs and group messages route to the corresponding Slack conversations
- Shared metric cards travel as links that reopen the exact view **and the
  conversation they were discussed in**
- Realtime over Socket Mode when configured, with a 3s poll on the open thread
  underneath it

**Realtime deliberately does not depend on a tunnel.** The HTTP Events API needs
Slack to reach your machine; a quick tunnel re-rolls its hostname on every
restart, which silently killed delivery twice. Socket Mode dials outward
instead. `./check-slack.sh` reports which transport is actually live and why.

---

## Running it

```bash
npm install
npm run dev            # http://localhost:5173/Growth/
```

**Everything above works with no configuration** except Slack and the Claude
assistant, which need `.env.local` — see `.env.example`.

The Slack and assistant endpoints are **Vite dev-server plugins** (`server/`),
so they do not exist in the production build. The deployed site detects this and
degrades honestly: Connect controls become disabled "Local build only" labels,
the assistant falls back to its local engine, and chat falls back to a seeded
thread. Nothing pretends to be connected.

⚠️ **The dev API has no authentication.** That is fine on localhost and *not*
fine through the public tunnel Slack OAuth requires — while that tunnel is up,
anyone with the hostname can read the connected Slack conversations and post as
you. Do not leave it running.

---

## Structure

```
src/
  styles/tokens.css     220 declarations, three tiers
  styles/tokens.ts      typed references, not hex values
  components/           29 components, each with its own CSS
  data/                 seeded metrics, chat, Slack client, assistant
  screens/              Reports, Notifications, Settings
server/                 Vite plugins: Slack OAuth, events, assistant
```

---

## Known gaps

Listed because a reviewer will find them anyway, and an audit you publish is
worth more than one you fail.

- **No tests.** `metrics.ts` has a seeded PRNG normalised to exact figures —
  a precise invariant with nothing asserting it.
- **Light-mode contrast.** `--text-muted` is 2.78:1 and the semantic status
  pills sit between 2.8:1 and 3.4:1. The dark-mode equivalents pass, which is
  the tell: the light pairs were never measured.
- **`loading` / `error` / `empty` states are implemented but unreachable** —
  the data layer is synchronous, so no call site can set them.
- **Keyboard gaps.** Table rows are click-only, overlays have no focus trap or
  restore, and the chart has no text alternative.
- **No routing.** Navigation is component state, so the back button leaves.
- **No token generation script** — see above.
