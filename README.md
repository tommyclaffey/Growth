# Growth — Design System in Code

A React + TypeScript implementation of the Growth design system, with the token
layer generated directly from the Figma file rather than transcribed by hand.

> **Figma:** `b6JvDQQ7QcWJpckvZyAbjm` · **Live case study:** [tommyclaffey.com/portfolio/growth](https://tommyclaffey.com/portfolio/growth)

---

## Why this exists

A design system in Figma is a claim. A design system in code that renders the
same values is evidence.

**The specific claim being tested:** the tokens are generated, so they cannot drift.
That is only true if there is a generation step. There is one, and this is it.

---

## The token layer

Three tiers, mirroring the Figma structure exactly.

| Tier | Count | What it holds | Referenced by |
|---|---|---|---|
| **1 · Primitives** | 78 | raw values — `--violet-500: #635BFF` | tier 2 only |
| **2 · Semantic** | 55 | roles — `--accent-base: var(--violet-500)` | components |
| **3 · Scale** | 24 | spacing, radius, border width | components |

**The rule: a component that reaches past tier 2 into a primitive is a bug.**
That is what makes rebranding a one-line change instead of a search-and-replace.

### Modes

Light and dark are `[data-theme]` attributes, not separate stylesheets. Every
semantic token re-aliases; primitives never change.

```html
<html data-theme="dark">
```

### One thing worth reading in `tokens.css`

The `--channel-*-soft` tokens **invert between modes**:

```css
[data-theme='light'] { --channel-meta-soft: var(--brand-meta-700); }  /* darker  */
[data-theme='dark']  { --channel-meta-soft: var(--brand-meta-500); }  /* saturated */
```

They are the bottom stop of a bar gradient. If both modes aliased the same step
the gradient would collapse flat in one of them. That inversion is deliberate
and it is the kind of thing that only shows up once you build it twice.

### And one scar

The alpha primitives (`--ink-a-05`, `--violet-a-25`, and friends) exist because
**a solid colour token cannot carry opacity.** Binding one to a shadow silently
forces it to 100%, which shipped a regression in Figma: every card, header and
menu rendered with a heavy black drop shadow.

The verification that passed it compared RGB and ignored alpha.

> A green check on a partial assertion is more dangerous than no check at all.

---

## Structure

```
src/
  styles/
    tokens.css      generated · 78 primitives, 55 semantic, 24 scale
    tokens.ts       generated · typed references, not hex values
  components/
    Button/
      Button.tsx
      Button.css
```

`tokens.ts` deliberately exports **CSS variable references, not hex codes**. If it
held values, dark mode would break and the two files would drift within a week.

---

## Status

**This is a rough draft.** What exists:

- ✅ Full three-tier token layer, generated from Figma
- ✅ Typed token exports with a `channelGradient()` helper
- ✅ `Button` — the merged component, all states, focus ring, both variants

Not yet built: KPI card, Chart, Table row, Nav item, Storybook, deployment.

---

## Next

1. **`npm create vite@latest` → React + TS**, then drop `src/` in
2. Add Storybook — the deployed Storybook is the artifact a reviewer actually clicks
3. Build the remaining five READY components
4. Deploy to Vercel

⚠️ **The regeneration step is the point.** When Figma changes, tokens get
re-exported rather than hand-edited. A token file edited by hand is just CSS.
