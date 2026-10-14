# Growth

React + TypeScript marketing-analytics dashboard. Public repo, deployed to
GitHub Pages.

## ⭐ Read BACKLOG.md first

`BACKLOG.md` is the memory bank — Tommy's ideas, captured as they're said so
they survive between sessions. **Check it at the start of any Growth session**,
and when he says *"add to the backlog: …"*, write it up there rather than
answering in chat and letting it scroll away.

## How we work on this

**Tommy writes the React. Claude explains, reviews and corrects.**

This inverts the rule used for Figma, and deliberately: with Figma he could open
the file and see the result, but code is text he is still learning to read, so
"Claude builds first" produced a working codebase he cannot defend in an
interview. Path: `(C) Learning React — The Design Engineer Path` in the vault.

*(Exception, in force during audit and fix sessions: Claude does write code when
Tommy asks for a specific fix or feature. The rule is about who drives the
learning, not a prohibition.)*

## Standards this codebase holds itself to

- **Every control does what it says.** The recurring defect here is a claim the
  code does not honour — a status reporting what was stored rather than what was
  true, a button with no handler, a slider that cannot be operated.
- **One rule, one place.** Direction (`higherIsBetter`), period-over-period
  (`deltaOf`), sparkline sampling (`sampleOf`) each exist once. Two copies of a
  rule is a rule that drifts.
- **Verify the output, not the build.** `tsc` and a green suite cannot see a
  missing element. Twice this session an edit silently did nothing and every
  check still passed.
- **Tests assert behaviour.** Render tests exist for exactly this reason.

## Commands

```
npm run dev          # localhost:5173
npm test             # vitest
npm run lint
npm run build
npm run brand:check  # rasterise brand assets so they can be LOOKED AT
```

## Figma
File `b6JvDQQ7QcWJpckvZyAbjm` (Growth). All required pages exist (checked Oct 12 2026):
00 Cover · 01 Brand guide · 02 Design system · 03 Wireframes · Lo-fi (desktop + phone) ·
04 Hi-fi · Desktop (prototype, 19 screens) · 05 Hi-fi · Phone (prototype, 17 screens) ·
06 Mockups (iPhone 1206×2622, laptops 2560×1664 + 3456×2234, desktop 5120×2880, light + dark,
plus Paid Search / Meta / YouTube laptop channel pages). Screens are captures of this app: the
app is the source of truth. Mockup charts use the trend line, bars only where the metric is Leads.
