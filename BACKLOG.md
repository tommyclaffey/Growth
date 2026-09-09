# Growth — Backlog

**The memory bank.** Ideas land here the moment they're said, so they survive
between sessions instead of living in a chat that scrolls away.

**How to add:** just say *"add to the backlog: …"* — no format required, it gets
written up here. **How to pick up:** say *"what's in the backlog?"* or point at
an ID.

**Status key:** 💡 idea · 🔍 needs a decision · 🟢 ready to build · 🔨 in progress
· ✅ done · ❄️ parked

---

## ✅ G-001 — Every state change is reversible *(done Sept 9)*

**Derived AND assigned.** "Needs attention" now accepts both: attention the data
raised, and attention a person assigned.

| Action | Reverse |
|---|---|
| Dismiss an alert | ✅ **inline undo, named** — "Undo 'Meta CAC ↑ 42% WoW'" |
| Mark read | ✅ Mark unread, per row |
| Flag a campaign | ✅ same button toggles it off |
| Flag a notification | ✅ same |
| Clear an assigned flag | ✅ restored to the **top** of the queue, not its old position |

⭐ **The decision that shaped it:** derived-only made the strip a readout — there
was nothing to re-flag because nobody flagged anything. Accepting assigned state
makes it a **queue** you can add to. The two kinds render differently on purpose:
*"your CAC rose 42%"* and *"you flagged this Tuesday"* are not the same claim.

Assigned flags are **not** gated by the Settings alert switches. Those control
what the data surfaces; silencing pacing warnings must never silence something a
person put there by hand.

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
- G-001 — reversible state, derived + assigned attention
- Notification rows open the campaign they name
