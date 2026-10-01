# Growth — Backlog

**The memory bank.** Ideas land here the moment they're said, so they survive
between sessions instead of living in a chat that scrolls away.

**How to add:** just say *"add to the backlog: …"* — no format required, it gets
written up here. **How to pick up:** say *"what's in the backlog?"* or point at
an ID.

**Status key:** 💡 idea · 🔍 needs a decision · 🟢 ready to build · 🔨 in progress
· ✅ done · ❄️ parked

---

## 🌟 G-012 — THE AI DECISION MAKER *(north star, Sept 27)*

> *"An AI decision maker to help take this data and then suggest decisions to make on this data…
> a thought partner alongside those analytics."* — Tommy, Sept 27

**Full concept:** `(C) Growth — The AI Decision Maker (North Star, Sept 27 2026)` in the vault.
**This is the direction everything else now serves.** Not a feature in a list.

**The dashboard says what happened. This says what to do — and shows its work.**

### ⚠️ It is NOT the existing assistant

The assistant answers *"what's my CAC on Meta?"* — retrieval. This answers *"where should my next
$10k go?"* — judgment. **A wrong answer costs a moment of confusion; a wrong decision costs money,
and the user acted on it because the product said so.**

### 🚨 The collision, which is the important part

`server/assistantApi.ts` rule 2, written months before this came up:

> *"You can say WHAT changed and BY HOW MUCH. **You cannot say WHY.** This data has no attribution
> model, no campaign log, and no outside context."*

**A decision is a causal claim.** "Move budget from A to B" means "B will convert it better."

⭐ **The example that proves it matters.** Point a naive AI at this dashboard and its FIRST
recommendation will be *"cut podcast spend, CAC is $129 vs Meta's $36."* That is precisely what
rule 3 forbids — and it is probably **wrong**. Podcasts are upper-funnel; a last-touch dashboard
systematically undervalues them, and the podcast ad is often what caused the branded search Meta
got credit for. **The most confident, most data-supported recommendation available is a trap, and
the user cannot tell.**

> The interview line: *"The first thing my AI decision layer refuses to do is the thing it looks
> most qualified to do."*

### 🏗 The architecture — numbers are code, only the argument is generated

🛑 **Do not ask a model what to do.** A deterministic engine enumerates candidates from the data;
the model writes the argument.

- **The maths becomes unit-testable.** An LLM's arithmetic is not.
- **It works with no API key** — so it works in the deployed static build, the constraint that
  already bit Slack and the assistant.
- Same precedent as `assistantClient.ts`: *"THE FALLBACK IS THE FEATURE."*

### 🎚 Three confidence tiers — the core of it

| Tier | | Recommend? |
|---|---|---|
| **1 · Arithmetic** | *"takes 12% of spend, returns 3% of leads"* | ✅ yes |
| **2 · Conditional** | *"buys ~180 leads **if CAC holds at that volume**"* | ✅ yes, condition visible |
| **3 · Causal** | *"cut podcasts"* · *"creative is fatigued"* | 🛑 **no — becomes a QUESTION** naming the missing data |

⚠️ **Rank by how well-supported a decision is, never by how big the number is.** The biggest dollar
figure on this dashboard is almost always a tier-3 trap.

**Every decision carries a falsifiable expectation** — expected outcome, stated assumption, a date
to check. A recommendation nobody can grade means nobody ever learns whether the engine is good.

### 🔗 Why it fits: the object is already half-built

**Flag** *(this matters — G-001 ✅)* → **Task** *(someone owns it, by a date — G-008 ✅)* →
**Decision** *(here's the action, the reason, what we expect)*.

`attention.ts` already says it: *"A task is a FLAG WITH FIELDS, not a second object."* A decision is
more fields on the same record. And G-001 already made the queue accept **derived** and **assigned**
entries rendered differently — **a third source, *proposed*, slots straight in.**

### 🛣 Build order — step 1 needs no model
1. [x] ~~**`decisions.ts`** — pure candidate engine, typed, unit tested. No UI, no model.~~
   ✅ **DONE `09eedaa`** — 8 detectors, `validate()` enforcing the tier contract, 24 tests.
   ⚠️ **Three detectors are silent and right to be — see G-013.**
2. [x] ~~**Decisions surface**~~ ✅ Sept 27–28 — sectioned by confidence, Accept/Dismiss-with-reason, Decided queue with owner + due date (G-008), Go to.
3. [x] ~~**Tier 3 as questions**~~ ✅ — "Worth investigating", no Accept, names what would answer it.
4. [x] ~~**Model as narrator**~~ ✅ — `/api/assistant` renders `get_decisions`; local engine fallback.
5. [x] ✅ **Grading** *(Sept 29)* — `grading.ts`. Baseline captured at decision; numbers compared after the check date; unmoved = "no new data", never "missed" (every numeric grade today, the seed is frozen — says so); state decisions grade instantly; the rest graded by the person. Track record on Decided. Decided cards now outlive their finding. — expected vs actual once the check date passes. ⭐ Nobody else's portfolio dashboard
   keeps score of its own recommendations.

### ✅ Decided Sept 27
- [x] **Confidence-tier model** → ✅ **three tiers**, as above. `validate()` enforces it in code.
- [x] **Where it lives** → ✅ **its own nav item**, beside Overview/Channels/Campaigns/Ads.
      A co-equal surface, not a widget — it is a thought partner, not a panel.
- [ ] ⚠️ **Capture the research.** Tommy said this came from usability testing or a conversation.
      **Write down what was said.** Growth's case study has no research section — this origin is
      worth more than any feature here.

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

## ✅ G-008 — A task builder, with owners *(UI DONE Sept 28)*

> ✅ **Built on the Decided queue, Sept 28.** Every decided card — engine or written — gets an
> owner picker (the 4 roster members, avatar shown) and a date. Overdue is computed from the
> LOCAL date (it was UTC — a decision due today went red at 5pm in Arizona), shown in words and
> a red edge. **An overdue decision returns to Needs attention**, red, owner named, with **no ×**
> — clicking it opens Decisions. One predicate, `onAttentionStrip`, feeds both the strip and
> Clear all, so they cannot drift. Tests: `DecisionTasks.test.tsx`.
> **Deliberately not built:** reminders, a task screen, Slack posting on assign. The Slack post is
> the natural next demo if wanted.
> ⚠️ **Open question:** the "done when its campaign Ends" rule covers campaign flags only. A
> decision about a channel or the whole account never Ends — for now you close it with Remove.

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

## ✅ G-010 — The macro view is thinner than the tier under it *(DONE Sept 27 — option 2 built: blended across the channels that can report it, coverage named on the card, "4 of 6")*

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

## ✅ G-013 — Ads have no performance variation *(FIXED Sept 27 — `30b9cee` + `a5e5773`)*

**Found by the decision engine finding nothing** — three detectors came back empty and were right to.

`creative.ts` assigns an ad its **spend and its leads by the SAME share** of its ad set. So every
ad inside a campaign has an **identical CAC by construction:**

```
c1a-cr1   spend=9920  leads=289.1  cac=34.31
c1a-cr3   spend=7440  leads=216.8  cac=34.31   ← same, exactly
c6a-cr1   spend=11040 leads=301.3  cac=36.64
c6b-cr1   spend=7280  leads=198.7  cac=36.64   ← same, exactly
```

`adSets.ts` and `adRanking.ts` both scale by spend share only, so the same flatness runs through
the ad-set tier too. **Performance variation exists only at campaign level and above**, where
`campaignSeries` adds a per-campaign leads wobble.

### ⚠️ What this undercuts, stated plainly

- **The Ads screen (`52f924b`)** ranks ads that are all equally efficient *within* a campaign. Its
  relative mode still differentiates across campaigns and channels, so the screen is not useless —
  but *"which of my 40 ads is winning"* currently resolves to *"which campaign is winning,"* and
  that was already answerable.
- **`rankCreatives` by CAC inside a campaign is a no-op** — every ad ties and it falls through to
  the spend tie-break.
- **The decision engine's two most valuable detectors cannot fire:**
  `spend-return-mismatch` (pause an underperformer) and `scale-winner`.
- 🚨 **And `reallocate-within-channel` cannot fire either**, for a second and separate reason: **no
  channel has two `Active` campaigns.** Meta has one Active + one Paused, TikTok one + one Draft,
  Paid Search one + one Review, podcasts one Ended. That is a *fixture* problem, not a code one.

### ⭐ The insight worth keeping

**The decision engine turned out to be a test of the data model.** Pointing it at the dataset
immediately exposed where the seeded data is too uniform to be realistic — a real ad account has
wildly varying ad performance, and this one has none. **No amount of UI would have revealed that;
a detector finding nothing did.**

### ▶️ The fix
- [ ] Give each ad its own **efficiency wobble**, the way `campaignSeries` already does per
      campaign — deterministic, seeded from the ad id, and **renormalised so the ads still sum to
      their ad set exactly.** The reconciliation tests are the guard rail.
- [ ] Same for ad sets within a campaign.
- [ ] Add a **second Active campaign** to at least one channel so reallocation has something to
      compare. ⚠️ Changing a fixture moves the normalised totals — the existing daily-reconciliation
      tests will catch it.
- [ ] ⚠️ Do it **with** G-011, not separately. Both are `metrics.ts`/`creative.ts` surgery on the
      same normalisation, and doing them in two passes means reconciling twice.

---

## ✅ G-011 — The generator invents clicks podcasts cannot have *(FIXED Sept 27 — `30b9cee`)*

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

## ✅ How G-011 and G-013 were resolved *(Sept 27)*

Done **together**, because both are surgery on the same normalisation and two passes would
mean reconciling twice.

### G-011 — zero, not undefined 🔄 *(reversed my own recommendation)*

**For a podcast, "no clicks" is TRUE** — the falsehood was 7,919, not 0. And the absence
contract **already exists at the right layer**: `CHANNEL_METRICS` says what a channel may
display, `coverageFor` says which channels are in a blend. Adding a second contract to `DayRow`
would be two mechanisms for one job. **Ten modules read `.clicks`.**

⚠️ **The refinement that mattered:** `CANNOT_PRODUCE` is deliberately **not** derived from
`CHANNEL_METRICS`. That table is a *display* vocabulary; this is a *capability* claim. **Paid
Search omits `Impressions` from display but reports CTR, which needs impressions as its
denominator** — zeroing off the display table would have left it claiming a CTR with nothing
underneath.

**`exportCsv` writes BLANK, not zero.** In a spreadsheet a zero sums and averages and drags a
CTR column down; an empty cell is excluded from both.

### G-013 — wobble the lead share, compose through the ad set

Spend/impressions/clicks follow **spend** share. Leads/sales/revenue follow a **wobbled lead**
share. The gap between them *is* efficiency.

⭐ Wobble applied **within** an ad set and renormalised there, then multiplied by that ad set's
share of its campaign — so ads sum to ad set sum to campaign, all exactly. Wobbling ads directly
against the campaign would have left them agreeing with the campaign while **disagreeing with
the ad-set row printed right above them.**

⚠️ First pass used ±15% and the engine **still** found nothing — a 1.2 worst-to-best ratio means
no ad is ever far enough out of line to pause. **Ads now ±45%, ad sets ±20%**, because creative
is the biggest lever in paid media while the ad sets in a campaign were built to be comparable.
Ad CAC now spreads **$27 → $136**.

### 🔄 It invalidated two claims from `52f924b`, and they were right to break

*"An absolute CAC ranking re-derives the channel ranking exactly"* passed **for the wrong
reason** — with every ad identical, a raw sort had nothing to order by but channel. True of the
fixture, not the product. Rewritten to the empirical version: the channel spread dwarfs the
within-channel spread, so **the dearest channel cannot reach the top quartile** however well its
ads did for their peers.

### ⭐ And chasing the last silent detector produced a better one

`scale-winner` still wouldn't fire — because **the best-returning creatives are PAUSED**
(`c1a-cr3` at 1.5× its share of spend, switched off; every Active ad between 0.67 and 1.21).

**New `paused-winner` detector.** Tier 1, historical arithmetic only. Says *"review why this is
paused"* — **never "turn it back on"**, which would be a forecast and belong in tier 2. States
its own limitation on the card: a paused ad's figures cover the whole window, not its live span.

### ▶️ Left open, deliberately
- [ ] **The fixture is unrealistically thin on Active campaigns.** No channel runs two. Real
      accounts run several. Adding one is fixture surgery — Meta's campaigns sum to the channel's
      published spend *exactly*, so a third means re-splitting it. **Its own commit, with the
      reconciliation tests as the guard.**
      *Tests now construct the state via `setStage` so the logic is verified regardless.*
- [ ] A **paused ad still reports full-window figures** — no per-ad start/stop dates. Currently
      disclosed on the card rather than fixed.
- [ ] The **chart's metric toggle still offers all six metrics on every channel**, so a podcast
      channel screen can plot a flat-zero Clicks line. The KPI row respects `CHANNEL_METRICS`
      now; the chart does not.

---

## ⏸ G-002 — Paused ads in the creative section *(unchanged Sept 29 — now consistent: hidden by default on the campaign page AND the Ads screen, count on the toggle. Revisit with real data.)*

Currently hidden by default with the count on the toggle. Options when this gets
picked up: leave as is · give them a muted section of their own · let them rank
but flag that their numbers are historical.

*Leaning: leave it until real accounts are connected and the behaviour can be
judged against real data.*

---

## ✅ G-003 — Campaign preview band: fixed height or ratio? *(DECIDED Sept 29: keep the fixed band)*

> **Decision:** the campaign preview keeps its fixed 128px band; ad cards keep 4:5. They are
> different jobs — an ad card SHOWS the artwork (so its true shape matters), a campaign preview
> SUMMARISES a campaign (the image is a thumbnail of its best ad, and a row of previews must
> line up regardless of which ad wins). Same product, two correct answers, now a decision.


Ad cards use a 4:5 ratio so heights match at every breakpoint. The campaign
preview cards on channel screens still use a fixed 128px band. Different card,
different job — but it is an inconsistency, and it should be a decision rather
than an accident.

---

## ✅ G-004 — A base class for buttons that reset their own box *(DONE — `.gr-unbutton` in index.css, used in 13 files. A few older rules still restate `font: inherit`; harmless, remove when touched.)*

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

Arbitrary date range *(→ Phase 3)* · ~~real prior-period comparison~~ ✅ Sept 28 ·
alert thresholds · multi-channel selection · a proper budget model.

---

## ❄️ G-007 — Backend + real ad-platform APIs

The whole API is a Vite dev-server plugin, so none of it exists in production.
Needs a host, a database and auth. Plan lives in the vault:
`(C) Growth Backend — Build Plan (Sept 4 2026)`.

⚠️ **Two long-lead items are worth starting even while paused**, because they
wait on other people: the **Meta app** and the **Google Ads developer token**.

---

## 🔁 Circle back — Channels table *(parked Sept 29)*

> Tommy: *"better, but let's circle back."* Not finished to his eye — revisit before beta.

**Where it stands** (`23bb9de`): trend always ROAS · "Change in" select, 11 metrics grouped
Volume/Efficiency, default CAC · dash for metrics a channel can't report · All-channels total row
· campaign count under each name · share bar capped.

**Open questions to ask him, not guess:**
- Is the problem the **control** (a select), the **columns** (too many / wrong ones), or the
  **empty space** below the table?
- Should the Channels screen carry more than a table — a CAC-by-channel chart, a per-channel card?
- Does the Overview table need the same "Change in" control, or keep following the chart toggle?

## ▶️ RESUME HERE *(Sept 30, late — Tommy moved to a new vault)*

**State:** everything is merged and live (`main` @ `5ebf159`, Pages deploy green). No open branches. 685 tests, lint clean. *(Oct 1: `decision-calls` merged, 688 tests, no open branches.)*

**Shipped Sept 30:**
- **Decisions are actions** — Pause / Cut / Raise / End / Approve / Turn back on / Put $X into…, never "find out why". Weekly moves drill to WHERE (ad/campaign); each card carries the number that says undo it and is graded on it. One action, one card. Tier 3 (Podcasts) stays a question; a tier-1 **2-week regional holdout** sits beside it.
- **The recommendation leads** on Decisions cards and in Ask (cards: where → WHAT → why → button; prose never restates them; new answers scroll to their top). Model prompt 2f: one-line lead, never soften an action.
- **Table:** periods DOWN (newest first), metrics ACROSS, fills the card, Total pinned, change hugs its figure, colour only past the Needs-attention threshold, all six metrics on by default.
- **Sidebar:** one list (sections were tried and REVERTED — Tommy: cluttered), Lucide-grid icons, `--nav-text` labels, 30px mark, raised white chip for the active page on a tinted rail, counts (Decisions = waiting proposals in accent; Notifications = unread) via `useNavCounts`.
- **Top bar:** filters | ⤓ Export · Team · ✳ **Ask AI** (primary). Theme toggle removed (still in Settings).

**✅ Decided Oct 1 (Tommy: "go with your gut") — merged and live (`main` @ `4c56a9f`):**
- **Decision queue:** 6 per tier (`PER_TIER` in `Decisions.tsx`), best-supported first, then "Show N more" / "Show fewer". The tier count still shows the full number. Demo's largest tier is 6, so the demo renders unchanged. Tests: `DecisionsLimit.test.tsx`.
- **Month-end "last month":** keep equal lengths (borrow days, dates on the label). No code change; reasoning recorded in `compareShift`.
- **`ThemeToggle/` deleted:** nothing imported it. Still in git history.

**🟡 Waiting on Tommy:**
- Vault: `03 Projects` was renamed `03 Work` — the CLAUDE.md folder maps still say `03 Projects`

**How we work (learned this week):** visual changes go on a branch → before/after screenshots → live only on "merge". Ask before reorganising when he asks "how can this look better" — he wants polish, not restructure. Stage explicit paths; colours via `tokens/tokens.json` + `npm run tokens`; no raw font sizes (type-scale guard). Screenshot rig: `/tmp/visual-audit/shot.mjs` on CDP port **9444** (another session's Chrome holds 9333), preview `vite preview --outDir /tmp/visual-audit/dist-branch --port 5195`.

<details><summary>Sept 29–30 chart-periods notes (merged)</summary>


Everything below is built, tested and screenshotted; nothing is live until merged.

- **Two years of history.** Seeded: 730 days — the recent 180 generated exactly as before (proven identical), 550 older days from their own generators. Real sources fetch ~15 months; shorter history is padded as *no data* (`FIRST`), never zero-spend days.
- **The window model** (`metrics.ts`): `WINDOW_END`, `sliceWindow`, `windowLabels`, `windowDates`, `hasWindow`, `compareShift` (calendar month/year, clamped at month ends), `endBackFor`/`isoForEndBack`, `atLatest`. Every channel/campaign/ad-set/ad slice and every label goes through it.
- **Custom dates, app-wide.** Range calendar (two months, click start + end, presets, keyboard). URL carries the END DATE (`to=2026-07-31`), resolved against whatever account is loaded. Ask follows the window (server applies it, tells the model the dates).
- **Things about NOW stay about now** under a custom window: decision grades, scheduled reports, channel budgets (`atLatest`). Alerts say "Week of …" instead of "This week".
- **Chart:** Compare gets *Same days earlier* (last week / month / year) — dashed, same axis; year shown when it differs; "no data" said, never zeros.
- **Table view:** Show checkboxes (any metric, at least one) · By **Day | Week | Month** (Week/Month = a column per period, oldest → newest, Total pinned right, change vs the period before only between whole periods). Metric buttons, Compare and legend hidden in Table view — the table follows the date picker only (Tommy). Honest totals: ratios rebuilt from parts.
- **"No comparison" is a dash, not 0%** (`changeOf` → NaN).
- Two audits on the new work: 18 findings fixed with tests.
- **Overnight Sept 30:** Ask answers trend questions (`trend.ts`, `get_by_period` tool); real-scale stress test (60 campaigns / 1,200 ads / 455 days: tiers reconcile across 1.2M cells) — fixed campaign-name matching (`campaignIn`), compact wire format (`wire.ts`, 51 MB → ~10 MB), ranking built once, engine not run twice, sort totals memoised; full-app dev-mode sweep clean — fixed start-of-data labels, 1-day week label, ISO dates in CSV.
- 🟡 **Open, for Tommy:** decision-queue length on large accounts (150–340 candidates); "last month" for month-end windows borrows days from two months back (honest, labelled) vs comparing unequal lengths; engine results are not memoised per render (70–115 ms on a very large account; a cache would need eight inputs in its key).
- ❌ **Tried and retired:** per-column comparison dropdowns (Tommy: sloppy) and Now/Then/Change inside the table (table follows the date picker only).

</details>

## ✅ Done

- **Visual consistency pass** *(Sept 29)* — 29 findings from two measured audits, six batches approved by Tommy: tables aligned, dark-mode visibility, stray browser spacing, one size per control, edges/rhythm, Ask decision text. TikTok's own dark artwork in dark mode.

- **Phase 4 — Meta, built and waiting on the app** *(Sept 29)* — everything except a real account to test against.
  - `metaNormalize.ts` (pure, tested against Graph v21 shapes): strings → numbers, leads/purchases from `actions` with NO double-counting across overlapping action types, zero-filled 180 days ending on **yesterday in the account's timezone**, stage/objective mapped, deleted-since campaigns kept.
  - `server/metaApi.ts`: code → long-lived token (stored in `.meta-tokens.local`), `/status`, `/accounts`, `/account`, `/data` (paged insights, level=campaign, daily).
  - Real campaigns replace the demo's everywhere (`applyStructure`); each keeps its own days.
  - Settings → **Data source**: demo / Meta, every step stated; a failed load shows Meta's own error with the way back.
  - 🐛 `vite.config.ts` only loaded 5 named keys from `.env.local` — `META_CLIENT_ID` would never have been seen. Fixed for all ad-platform keys.
  - ▶️ **Needs Tommy:** the Meta app (Todoist). Then: `META_CLIENT_ID` + `META_CLIENT_SECRET` in `.env.local`, restart, Settings → Data source → Connect → choose account → Use Meta. Ad sets and ads load with it — see below.
- **Real ad sets and ads from Meta** *(Sept 29)* — insights at `level=ad`, plus `/adsets` and `/ads` (with creative title, body, thumbnail). **Ads are the unit; ad sets and campaigns are sums of their ads**, so all three tiers reconcile by construction — the demo's rule. The campaign page, ad set page, Ads screen, ad ranking and grading all read the real rows. Deep links to real ids survive a reload (they used to be dropped because the URL was checked before the account loaded); the page says "Loading your account…" instead of "no longer exists".
- **Sign-in — five ways in, one account per person** *(Sept 29)* — email + password, Google, Slack, Microsoft, Microsoft Teams (OpenID Connect; logos are the providers' own files). First account only from this machine = owner in the `maya` seat; others via `GROWTH_ALLOWED_EMAILS`. Every `/api` route needs a session. Slack acts as the signed-in person with their own token; `?person=` spoofing closed. Public demo unchanged (no server = no login).
  - **One-click demo account** (Maya at Northbank, the `maya` seat), local only — Tommy uses Growth alone, so this replaced creating an owner account. Optional: `GOOGLE_CLIENT_ID/SECRET`, `MS_CLIENT_ID/SECRET` for those buttons (register `<origin>/api/auth/callback`); Slack sign-in needs `<https origin>/api/auth/callback` added to the Slack app's redirect URLs.
  - ⏭ **Next:** a real team roster from signed-in people (chat still shows the demo team).
- **Hardening pass** *(Sept 29)* — four audits (server, data, thought partner, UI), 39 bugs fixed with regression tests. See commits `72abbe6`…`abfe201`.
- **Phase 4b — Google Ads, built and waiting on the developer token** *(Sept 29)* — same seam as Meta, against the REST API (`googleAds:searchStream`, v25; override with `GOOGLE_ADS_API_VERSION`).
  - `googleNormalize.ts` (pure, 15 tests on documented shapes): micros → money; omitted zero fields read as 0; **conversions by category** (cost and categories can't share a query, so they're merged here); QUALIFIED_LEAD / CONVERTED_LEAD **not** re-counted; "Other" (DEFAULT) counts as leads — stated in code; **VIDEO campaigns route to YouTube**; Performance Max has no ads, so it uses campaign rows and leaves the ad tier unloaded; ad groups → ad sets, RSA first headline/description → the ad's copy; removed campaigns that delivered keep their numbers.
  - Server: refresh token stored (`.google-ads-tokens.local`), fresh access token per load; **manager accounts expanded** to their clients, each remembering its `login-customer-id`; Google's error codes translated (test-access token → "apply for Basic access").
  - Settings → Data source: one generic row per platform; Google names the **developer token** step Meta doesn't have.
  - ▶️ **Needs Tommy:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN` in `.env.local`. A new token reads **test accounts only** until Basic access is granted.

- **Phase 3 — the API seam** *(Sept 29)*
  - `src/data/source.ts`: the `DataSource` interface (account: name, **currency**, **timezone**, **periodEnd**; daily funnel rows per channel). `sources/seeded.ts` is ONE implementation of it.
  - `hydrate()` in metrics.ts loads any source; `PERIOD_END`, `DAY_LABELS`, `CURRENCY` are live bindings — **the clock is no longer frozen in code**, it is the source's last day. All money formats through `formatMoney` (was a hard-coded "$" in 3 places).
  - `useDataSource()`: real loading / error (with message) / empty from the request; the Settings simulator is now the second way in.
  - **Custom ranges**: any 1–90 days (90 = longest window with a full prior window in 180 days of history). "Custom…" in the picker; URL, chat links and the server all accept it.
  - ⚠️ Deliberate departure: NOT "every read path async". Async at the edge (one load), sync inside — ~40 pure functions and their tests unchanged. Argued in source.ts.
  - ▶️ **Left for Phase 4:** a source must also supply the campaign / ad set / ad STRUCTURE (today it comes from the seed's campaigns.ts). Timezone is carried but not yet used for day boundaries — a real adapter should bucket days in `account.timezone`.
  - Also fixed: the server's `get_delta` tool still told Claude change was "second half vs first half" — the pre-Sept-28 definition.

- **Phase 2 — accessibility, measured on the real page** *(Sept 28)*
  - **Contrast:** 0 failures, 10 screens × 2 themes (`docs/CONTRAST.md`, `npm run audit:contrast`); 46 token pairs enforced every test run. Fixed: primary button gradient (3.07–3.70:1), accent fills in dark (3.62:1 — new `--accent-fill`), avatar initials (3.0–4.1:1 — new `--avatar-*`), the dismiss × (2.78:1).
  - **Token generator:** `tokens/tokens.json` → `scripts/generate-tokens.mjs` → `tokens.css`; the test fails on a hand edit. ⚠️ Figma is now BEHIND the JSON (contrast fixes Sept 3 + 28) — sync is manual; Variables REST API is Enterprise-only.
  - **Keyboard,** found by driving Chrome with real key events: skip link (15 stops → 1); metric tabs one Tab stop + arrows/Home/End; **focus restore never worked** — `useOverlay` re-captured its return point on every render (inline `onClose`), so Escape from the assistant dropped focus to `<body>`; dropdown **selection** dropped focus to `<body>` (only Escape restored); Chat now takes focus when opened. Chart text alternative already existed (sr-only table).

- **Notifications: computed, not typed** *(Sept 28)* — 🚨 the six hand-typed alerts were mostly false against the data ("Meta CAC rose 42%" — it had fallen 5%; "ROAS fell below 2.0x" — it was 3.4x; a TikTok "monthly target" that did not exist). The Figma story (Meta CAC +42% WoW, Affiliates leads +31%) is now an **event in the seeded data** for the last 7 days only — 30-day totals unchanged — so every screen finds it. `notifications()` derives the feed from rules (15% WoW move, account pacing, 2.5× blended CAC, campaigns in Review); the Overview strip reads the same objects. Rows show the channel mark, both weeks drawn, the change, and open/ask **at 7 days on the alert's metric**, so the page shows the number the alert stated.

- **Reports, rebuilt** *(Sept 28)* — the thinnest screen, now worth opening. Summary strip (sending / next send / who receives), **Next run** computed from the last day of data, **Preview** shows the figures each report sends (per channel, its own window vs the one before — same functions as the CSV), Pause / Resume / Schedule-a-draft, recipients as faces + external count, a working **New report** builder. Fixed: "TikTok · YouTube" exported TikTok only; every report exported 30 days regardless of cadence; last-run dates after the data ended; a second Export that ignored the range. First screen checked in a real browser (headless Chrome via CDP, `/tmp/shot.mjs`) before handing over.
- **Every decision goes back to its item** *(Sept 28)* — "Go to ad / campaign / Meta / all channels" on every card; the overdue pill goes there too. Target stored on the flag at decision time.

- **Δ Prev is now the preceding window** *(Sept 28)* — was the back half of the selected window vs its front half (3 vs 4 days on a 7-day range) and a mean of daily ratios. Now this window vs the equal-length one immediately before, both summed then the metric taken once. Needed 90 days of history before the window (`HISTORY`), generated from separate seeds so no recent number moved. Every tier and the assistant read the same `changeOf`. ⚠️ Seeded deltas no longer match the Figma screens' Δ figures — the design numbers were half-splits; real windows differ. Campaigns/ad sets/ads share a constant fraction of their channel, so their Spend Δ equals the channel's by construction (true of seeded data only).

- Campaign detail pages, per-channel metric vocabularies, channel benchmarks
- Ad detail pages, creative section, drop-in asset library
- P1 — every control on screen does what it says
- P2 — URL reflects state; chat drafts survive
- G-001 — reversible state, derived + assigned attention
- Notification rows open the campaign they name
