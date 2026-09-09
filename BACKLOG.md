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

## 💡 G-008 — A task builder, with owners

> *"Maybe we should have a task builder in there. Maybe I'm part of this."* — Sept 9

**The natural next step after G-001, and it is the same object growing up.**

| | Says |
|---|---|
| **Flag** *(built)* | this matters |
| **Task** | this matters, **someone owns it**, and it is **due** |

⭐ **The likely shape: a task IS a flag with an owner and a date.** Not a second
system beside it. You flag a campaign, then optionally assign and schedule it,
and the Overview strip becomes a real work queue rather than a noticeboard.
Building tasks as a separate object would mean two lists that drift.

**Growth already has most of the pieces:** a member roster with avatars, real
Slack OAuth with two-way messaging, and deep links that reopen a view *and* the
conversation it was discussed in. **Assigning a task could post it to Slack and
link straight back to the campaign** — which is the demo nobody else's portfolio
dashboard has.

### 🔍 Decide first

1. **Is a task a flag with fields, or its own object?** *(leaning: fields)*
2. ✅ **What does "done" mean?** — ANSWERED Sept 9.

   > *"Done means when the campaign has been completed. Campaigns can always be
   > ongoing, but for example, an A/B test: if we did one campaign as a B and
   > we're not going with it anymore, technically the campaign would be
   > finished."*

   ⭐ **This already exists in the data.** `Stage` is
   `Active | Paused | Draft | Ended | Review`, and **Ended** is exactly the state
   described: the losing variant, switched off, not coming back. Three campaigns
   are already in it.

   **So a task closes when its campaign reaches `Ended`** — and neither of the
   two options originally written here was right. Not person-closed, which
   ignores what actually happened. Not metric-closed, which pretends a number
   can tell you a decision was made. **A person decided to end the campaign;
   ending it is the decision, and the task follows.**

   ⚠️ Follow-on: `Paused` is NOT done. A paused campaign can come back, so its
   tasks stay open. Only `Ended` closes them. That distinction is the whole
   value of using the existing vocabulary instead of inventing a task status.
3. **"Maybe I'm part of this"** — read as *assignment to a person from the
   roster*. Confirm: is it self-assignment only, or assigning to teammates?
4. **Due dates without a backend** — everything is localStorage today. Overdue
   states are easy; reminders are not.

⚠️ **The scope risk, said plainly.** A task system is a large surface, and the
part that sells it in an interview is the *judgment* — one object growing fields
rather than a second list — not the CRUD. Build the smallest version that shows
the idea. **Growth is a portfolio piece, not a project-management product.**

⚠️ **Not a conflict with Todoist.** The one-system-per-job rule governs Tommy's
own tasks. These are tasks *inside a product he is designing*, for a fictional
marketing team. Different thing entirely.

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
