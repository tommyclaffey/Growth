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

## 🔨 G-008 — A task builder, with owners *(data layer done Sept 9)*

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

1. ✅ **Flag with fields.** A separate task store would have drifted within a
   week: flag something, make it a task, clear the flag, orphan task. One record
   with optional `owner` and `due` cannot get out of step with itself.
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
3. ✅ **Assign to anyone on the roster.** MEMBERS already holds four people with
   initials and hues; self-assign-only would make it a to-do list rather than a
   team tool.
4. ✅ **Date only, overdue computed, no reminders.** Reminders need a backend.
   `isOverdue` is a function of the date and today, never a stored boolean --
   a stored one is true from the moment it is written and stays true after the
   date moves, which is this codebase's signature defect.

### ▶️ Still to build — the UI

Data layer, done rule and tests are in. What remains is the surface: an owner
picker and date field on the campaign page, avatars and overdue styling on the
Overview strip, and a place to see all open tasks.

⚠️ **The scope risk, said plainly.** A task system is a large surface, and the
part that sells it in an interview is the *judgment* — one object growing fields
rather than a second list — not the CRUD. Build the smallest version that shows
the idea. **Growth is a portfolio piece, not a project-management product.**

⚠️ **Not a conflict with Todoist.** The one-system-per-job rule governs Tommy's
own tasks. These are tasks *inside a product he is designing*, for a fictional
marketing team. Different thing entirely.

## ✅ G-009 — The hierarchy breaks at the ad set *(DONE Sept 27 — `5ba15fc` + `52f924b`)*

> Tommy, Sept 27: *"from the micro, from an individual [ad], to the macro, seeing all the
> channel traffic, all the way down to the individual ad within the campaign, and how
> everything in between is performing."*

**"Everything in between" is the part that does not exist.** Full audit:
`(C) Growth — Finish & Beta Plan (Sept 27 2026)` in the vault.

| Tier | Page | Daily series | Follows range | Metrics |
|---|---|---|---|---|
| Blended | ✅ | ✅ | ✅ | ⚠️ 4 only |
| Channel | ✅ | ✅ | ✅ | ✅ up to 9 |
| Campaign | ✅ | ✅ | ✅ | ✅ |
| **Ad set** | 🔴 none | 🔴 none | 🔴 static | 🔴 spend + leads |
| Ad | ✅ | ✅ | ✅ | ✅ |

⭐ **The chain breaks in the MIDDLE, and the tier below has more depth than the tier above.**
An ad has a daily funnel, a chart, a peer rank, a creative preview and a share figure. Its
parent ad set has five fields. `CampaignDetail.tsx` currently apologises for it on screen:
*"Ad set figures are period totals and do not follow the date range."* It is the only place
in the product that has to explain itself away.

⚠️ **And the ad set is where media buyers actually work** — budget, audience, placement and
bid all live at that tier. Campaign → ad skips it.

### 🔍 The decision that makes this more than CRUD

**Five tiers is not universal, and the product currently assumes it is.**

| Channel | Real hierarchy | Tiers |
|---|---|---|
| Meta | Account → Campaign → **Ad Set** → Ad | 4 |
| Google Ads / YouTube | Customer → Campaign → **Ad Group** → Ad | 4 |
| TikTok | Advertiser → Campaign → **Ad Group** → Ad | 4 |
| Affiliates | Network → Partner | 2 |
| Podcasts | Show → Spot | 2 |

**There is no ad set inside a podcast campaign.** Inventing one is the same defect this
codebase already named and fixed for metrics — printing a CTR for an audio ad.

⭐ **The fix is the pattern already here.** `CHANNEL_METRICS` declares what a channel can
*report*. Add a sibling — **`CHANNEL_DEPTH`** — for what a channel *contains*, with the
vocabulary named per platform (*Ad set* on Meta, *Ad group* on Google and TikTok, *Partner*
on affiliates, *Show* on podcasts). The UI navigates as deep as the channel goes and stops,
rather than rendering an empty tier.

### ✅ Built Sept 27 — `5ba15fc`
- [x] ~~`CHANNEL_DEPTH` — tiers + per-platform vocabulary~~ ✅ and `CREATIVE_NOUN` now derives
      from it instead of restating the same six answers
- [x] ~~Ad sets get a real funnel~~ ✅ `adSets.ts` — constant share of the campaign's daily rows,
      so they sum to the campaign **every day, exactly, by construction**
- [x] ~~Ad-set detail page~~ ✅ `AdSetDetail.tsx`, mirroring `CampaignDetail`'s shape
- [x] ~~Ad sets follow the date range; delete the apology~~ ✅ both
- [x] ~~Back walks the chain one step at a time~~ ✅ ad → ad set → campaign, breadcrumb names
      where it actually lands
- [x] ~~19 tests~~ ✅ daily reconciliation at every range · shares sum to exactly 1 · period CAC
      is not the mean of daily rates · render tests, because a green data suite cannot see a
      blank page

🐛 **Found while wiring the route:** the sidebar cleared `campaignId` and nothing else, so the
dead-nav bug its own comment described still happened one level deeper — from an ad page,
clicking Campaigns left you on the ad with no campaign behind it. `closeCampaign` and
`applyView` had the same hole. All three fixed.

🔄 **And a correction to the audit that produced this:** it claimed affiliates and podcasts have
only two tiers and should lose the middle level. **Wrong** — every channel groups its ads one
level up, and grouping is what the middle tier *is*. The tier count is the same; only the names
differ. Recorded in `channelDepth.ts`.

### ✅ Cross-channel ad ranking — DONE `52f924b`
- [x] ~~*"which of my ~40 ads is winning, everywhere?"*~~ ✅ new **Ads** screen and nav item

⭐ **The decision that made it more than a sorted list:** ranking ads across channels by raw CAC
**just re-derives the channel ranking** — podcasts cost ~$129 a lead, Meta ~$36, so Meta wins every
time regardless of how the ads are performing. **Default rank is channel-relative:** how far each ad
sits from the average ad on its *own* channel. A podcast spot 30% under its channel out-ranks a Meta
ad sitting exactly at Meta's average.

**There are two tests for that claim, not a comment asserting it.** One proves an absolute CAC sort
reproduces the channel order *exactly*; the other proves relative does not. If raw sorting ever
starts saying something new, the first test fails and the mode stops being justified.

`benchmark.ts`'s core extracted to `benchmarkAgainst()` so ad-vs-channel and campaign-vs-channel
share one copy of the count-vs-rate rule. All existing benchmark tests still pass — the point of
extracting rather than copying.

### ▶️ Still open at this tier
- [ ] Ad-set level **targeting / budget / bid**. The tier is real but reports only the funnel — it
      does not yet show what a buyer actually *sets* there.
- [ ] Creative **cards** still show static totals (the `CreativeSection` note admits it). Same
      defect the ad-set rows had; the new Ads screen is ranged, the cards are not.
- [ ] ⚠️ **Two doors to "which channels are on"** — `channels.ts` owns the persisted choice and
      pushes into `metrics.ts`'s runtime list. Components must subscribe to the former. Works, but
      it is one state with two setters, and that is how they eventually disagree.

---

## 🔍 G-010 — The macro view is thinner than the tier under it *(captured Sept 27)*

Overview shows **4 blended KPIs.** A channel page shows up to **9.** The product gets
*narrower* as you zoom out, and "see all the channel traffic" is the headline promise.

⚠️ **There is a real design problem in here, not just a missing feature.** You cannot blend
CTR across six channels when **podcasts and affiliates have no impressions and no clicks** —
the denominator does not exist.

1. Blend only what every active channel reports — honest, but it shrinks when podcasts are on,
   which looks like a bug
2. ⭐ **Blend across the channels that CAN report it, and name the coverage** — *"CTR, paid
   social + search only — 4 of 6 channels"*
3. Blend counts only, rates per channel — safest, least useful

**Leaning hard on 2.** It is the same judgment `CHANNEL_METRICS` already makes one tier down —
*show what the medium can honestly report* — extended to the blend, with the coverage stated
on the card. *"My blended CTR says which channels are in it, because two of six have no
impressions"* is a better interview answer than any feature on this list.

---

## 🔴 G-011 — The generator invents clicks podcasts cannot have *(found Sept 27)*

**Found by a test that failed for the right reason**, while building G-010's blended
coverage. Measured from `rowsFor(channel, 30)`:

| Channel | Clicks in the data | Impressions in the data | Should be |
|---|---|---|---|
| **Podcasts** | **7,919** | 408,000 | ⚠️ **zero clicks** — an audio ad has none |
| **Affiliates** | 9,576 | **192,842** | ⚠️ **zero impressions** — never bought, never reported |

⭐ **This is the September defect, one layer deeper.** `CHANNEL_METRICS` was built to stop
the product *printing* a CTR for an audio ad. It succeeded — the display layer is honest. But
**the generator underneath still produces the numbers**, so the figures exist, they are
fictional, and anything that reads `DayRow` directly can surface them.

G-010's blending is safe from it, because coverage scoping happens before the arithmetic. But
the fiction is still in the data, and two things will trip over it:

1. **CSV export reads the rows directly** — `exportCsv.ts` writes a Clicks column for every
   channel, so a podcast row currently exports a click count that cannot exist.
2. 🚨 **The API work.** A real Meta or Google response has no podcast in it at all, and a
   podcast tracker returns downloads and a promo-code attribution — no clicks, ever. When the
   seeded generator becomes *one adapter behind an interface* (Phase 3), it has to produce the
   same SHAPE a real source does, and right now it produces a shape no real source can.

### ⚠️ Why this was not fixed in the same commit

Blast radius. `metrics.ts` normalises the whole series so each channel's totals land on the
figures the design was built around, and the Sept 7 work derived impressions from spend × CPM
**specifically so every CPM and CTR lands in its published band**. Zeroing two channels'
columns moves the blended CAC, the channel rows, the export and several test fixtures at once.

**It wants its own session, with the reconciliation tests as the guard rail** — they already
assert campaigns sum to channels and ad sets sum to campaigns every day, so they will catch it
if the normalisation drifts.

### ▶️ The decision to make first

Does a channel's funnel carry **zero** for a metric it cannot report, or **undefined**?

- **Zero** is simpler and wrong in a specific way: zero is a measurement, and it means "we
  looked and there were none." For a podcast click it should mean "this cannot be measured."
- ⭐ **Undefined** is honest and forces every consumer to handle absence — which is exactly what
  a real API integration will force anyway, since the field simply will not be in the response.
  **Leaning here**, because the whole point of Phase 3 is that the seeded source and a real one
  behave identically.

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

⭐ **DECIDED Sept 27 — this is NOT a beta blocker, and it stays parked.** The beta is a
recruited, moderated one: five testers, watched, on an environment we choose. *"Desktop,
1440px+, Chrome"* is a legitimate constraint, **and a marketing analytics dashboard genuinely
is a desktop product** — nobody audits ad spend on a phone.

⚠️ It becomes blocking the moment the beta stops being moderated, or a tester is asked to use
it on their own machine on their own time. **The constraint has to be STATED to testers, not
assumed** — an unannounced 1300px floor is a broken product; an announced one is a scope.

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
