# Growth — Backlog

**The memory bank.** Ideas land here the moment they're said, so they survive
between sessions instead of living in a chat that scrolls away.

**How to add:** just say *"add to the backlog: …"* — no format required, it gets
written up here. **How to pick up:** say *"what's in the backlog?"* or point at
an ID.

**Status key:** 💡 idea · 🔍 needs a decision · 🟢 ready to build · 🔨 in progress
· ✅ done · ❄️ parked

---

## 💡 G-001 — Every state change should be reversible

> *"I want to be able to undo, or mark an idea as unread. If something needs
> attention, we can mark it as 'needs attention', the same way we can clear it."*
> — Sept 8

**The gap.** Every alert action in the app is currently **one-way**:

| Action | Reverse today |
|---|---|
| Dismiss an alert on Overview | ❌ only a bulk **Restore all** buried in Settings |
| Mark all read on Notifications | ❌ nothing — no way back to unread |
| Clear a single notification | ❌ no per-item undo |
| Re-flag something as needing attention | ❌ doesn't exist at all |

**Why it matters.** These are triage controls. Triage is guesswork — you clear
something, then realise it *did* matter. A one-way door makes people hesitate
before using the control at all, which defeats the point of having it.

**Shape of the work:**
- **Per-alert undo**, offered *at the moment of dismissal* — an inline "Undone"
  affordance on the strip, not a trip to Settings
- **Mark unread** on a notification row — the exact inverse of the read action
- **Re-flag as needs attention** — promote a notification back onto the Overview
  strip, so the strip becomes a working queue rather than a fixed list
- The store already separates `readAlerts` from `dismissedAlerts`, so the data
  model supports all three without a migration

⚠️ **The decision to make first:** is "needs attention" a *derived* state (the
data says CAC rose 42%) or an *assigned* one (a person flagged it)? Today it is
derived and hardcoded. Re-flagging only makes sense if the app accepts assigned
state too — and that is a real product decision, not a UI detail.

---

## 🔍 G-002 — Paused ads in the creative section

Currently hidden by default with the count on the toggle. Options when this gets
picked up: leave as is · give them a muted section of their own · let them rank
but flag that their numbers are historical.

*Leaning: leave it until real accounts are connected and the behaviour can be
judged against real data.*

---

## 🔍 G-003 — Campaign preview band: fixed height or ratio?

Ad cards use a 4:5 ratio so heights match at every breakpoint. The campaign
preview cards on channel screens still use a fixed 128px band. Different card,
different job — but it is an inconsistency, and it should be a decision rather
than an accident.

---

## 🟢 G-004 — A base class for buttons that reset their own box

Three times now, turning an element into a `<button>` has silently eaten
`font` and `text-align`, and each site restated them separately. That is a
pattern, not three incidents. One `.gr-unbutton` utility, applied everywhere.

---

## ❄️ G-005 — P4: responsive

Zero width-based media queries. 232px sidebar + 360px chat = 592px of chrome
that cannot shrink inside `position: fixed; overflow: hidden`. Usable floor
~1300px with chat open; Reports breaks on a 1280px laptop.

**A real project, not an afternoon.**

---

## ❄️ G-006 — P5: product gaps *(features, not defects)*

Arbitrary date range · real prior-period comparison *("Δ Prev" is currently the
selected window split in half)* · alert thresholds · multi-channel selection ·
a proper budget model.

---

## ❄️ G-007 — Backend + real ad-platform APIs

The whole API is a Vite dev-server plugin, so none of it exists in production.
Needs a host, a database and auth. Plan lives in the vault:
`(C) Growth Backend — Build Plan (Sept 4 2026)`.

⚠️ **Two long-lead items are worth starting even while paused**, because they
wait on other people: the **Meta app** and the **Google Ads developer token**.

---

## ✅ Done

- Campaign detail pages, per-channel metric vocabularies, channel benchmarks
- Ad detail pages, creative section, drop-in asset library
- P1 — every control on screen does what it says
- P2 — URL reflects state; chat drafts survive
- Notification rows open the campaign they name
