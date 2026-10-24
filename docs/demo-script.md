# CrowdTwin 90-second demo recording script

This is a practical shot list for recording the manual 90-second submission
capture. It is written for a human operator driving the local studio. It does
not produce or claim a recording; see the checklist at the end.

## Where the numbers come from

- **Measured on:** 2026-10-24, repository commit `250b6d6` (`main`), against the
  locally running SpacetimeDB, offline API, and Vite studio.
- **Run configuration:** ATL fixture evidence (`fixtures/captured-event.json`)
  with the default world from `fixtures/default-world-spec.json`, requested as
  `"mode":"CAPTURED","fixture":"atl"`; seed **42** (fixed server-side in
  `apps/orchestrator/src/workflow.ts`), horizon **28,800 simulated seconds
  (8h 00m)**, 400 simulated attendees, booth left at the default position
  (`x=180, y=280`), all default booth economics unchanged, and all four costs
  confirmed: unit COGS $6.00, booth fee $6,000.00, staff + equipment $5,000.00,
  organizer cut 30%. Inventory 2,000 units, one server, $18.00 item price.
- **Intervention toggles measured:** each option alone, and the combination of
  all three (`Relocate Booth to Main Stage Artery`, `Add +1 Server (+$300 labor)`,
  `Cap Inventory Prep at $4,500`).
- **How:** the full flow was executed twice in that session: once through the
  HTTP API (`POST /api/jobs` -> approve -> step -> variants -> audit) and once
  through the browser by `node scripts/studio-gate.mjs` (exit code 0). Both
  paths produced identical figures, including different step chunking
  (10 ticks then 950 ticks via the API; `+10x Step`, `Play`, `Pause`,
  `Finish baseline` in the browser).
- **Every figure below is a measured engine output from that run.** Nothing is
  rounded or adjusted. If the engine, fixtures, default world, or policy change,
  re-measure before recording.
- **Do not speak the spec's `-$24,600` or `+$3,120`.** Those were illustrative
  UI copy in the original brief. The engine does not reproduce them and they are
  not acceptance targets.

### Measured figures (ATL, seed 42, 8h 00m)

Vendor telemetry and paired comparison values, exactly as the studio formats them:

| Metric | Baseline | Relocate only | +1 server only | $4,500 cap only | All three combined |
| --- | ---: | ---: | ---: | ---: | ---: |
| Units sold | 122 | 125 | 137 | 122 | 140 |
| Gross sales | $2,196.00 | $2,250.00 | $2,466.00 | $2,196.00 | $2,520.00 |
| Net profit | -$10,194.80 | -$10,175.00 | -$10,395.80 | -$10,194.80 | -$10,376.00 |
| Cash balance | -$21,462.80 | -$21,425.00 | -$21,573.80 | -$13,962.80 | -$14,036.00 |
| Inventory outlay | $12,000.00 | $12,000.00 | $12,000.00 | $4,500.00 | $4,500.00 |
| Consumed COGS | $732.00 | $750.00 | $822.00 | $732.00 | $840.00 |
| Staff + equipment | $5,000.00 | $5,000.00 | $5,300.00 | $5,000.00 | $5,300.00 |
| Remaining inventory | 1,878 | 1,875 | 1,863 | 628 | 610 |
| Balked queue | 51 | 46 | 9 | 51 | 9 |
| Balked price | 172 | 172 | 172 | 172 | 172 |

Baseline-only telemetry also shown on screen: organizer fee $658.80,
0 abandoned, 55 low affinity, 0 stockout.

Underwriter Desk, baseline audit (`Audit run` = `Approved baseline`):

| Turnout | Attendees | Break-even k/n | Median sales | Median profit | P10 profit | Queue / price |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| LOW | 200 | 0/15 | $1,278.00 | -$10,531.40 | -$10,604.00 | 7 / 84 |
| BASE | 400 | 0/15 | $2,250.00 | -$10,175.00 | -$10,227.80 | 50 / 168 |
| HIGH | 560 | 0/15 | $2,682.00 | -$10,016.60 | -$10,056.20 | 115 / 237 |

Policy verdict **REJECT**. Proposed inventory preparation cap **$4,500.00**.
Underwriting diff: `- Inventory preparation: 1200000 cents`,
`+ Proposed inventory preparation cap: 450000 cents`, booth fee unchanged
`600000`, staff/equipment unchanged `500000`, current total upfront capital
`2300000 cents` ($23,000.00 = $6,000 booth fee + $12,000 inventory outlay +
$5,000 staff/equipment). Bottleneck diagnosis: "Price affordability is the
larger recorded rejection category; fixed costs and organizer share also affect
profit." Narrative and diff badges read `Deterministic fallback`.

Underwriter Desk, combined-intervention audit (`Audit run` =
`Latest paired intervention`):

| Turnout | Attendees | Break-even k/n | Median sales | Median profit | P10 profit | Queue / price |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| LOW | 200 | 0/15 | $1,314.00 | -$10,818.20 | -$10,890.80 | 1 / 84 |
| BASE | 400 | 0/15 | $2,574.00 | -$10,356.20 | -$10,422.20 | 9 / 168 |
| HIGH | 560 | 0/15 | $3,528.00 | -$10,006.40 | -$10,085.60 | 23 / 237 |

Policy verdict **REJECT**. Proposed cap **$4,500.00**. Diff shows inventory
preparation `450000` -> cap `450000`, staff/equipment `530000`, total upfront
capital `1580000 cents` ($15,800.00).

Recorded decision used for the inspection beat (deterministic for this run):
customer **#7**, `Budget browsers`, reason **BALKED QUEUE WAIT**, recorded at
**3h 40m**, wallet $18.21, patience 123s, observed price 1800 cents, estimated
wait 360 seconds, remaining stock 1902. Fallback explanation text: "I saw a
price of 1800 cents with 1821 cents in my wallet, an estimated wait of 360
seconds and patience of 123 seconds. My recorded decision was
BALKED_QUEUE_WAIT, not a prediction about my real behavior."

## Pre-flight checklist

1. Services running, in this order, per `README.md` "Run locally":
   SpacetimeDB on `127.0.0.1:3000` with `crowdtwin` published; the API in
   offline mode (`npm --workspace=apps/orchestrator run dev`, confirm
   `curl --fail http://localhost:4000/api/health` reports `ok: true` and
   `offline: true`); the studio (`npm --workspace=apps/web run dev`).
2. Browser at `http://127.0.0.1:5173` (or `http://localhost:5173`; both are
   allowed API origins). Suggested window: 1440 x 1000, which is what the
   studio gate uses and renders without horizontal scrolling. Hide bookmarks
   and other tabs' content from the capture area.
3. Confirm the header status reads `Offline providers` and that the runtime
   note under it is visible. Do not record with provider keys configured.
4. **Prepare two tabs.** The spec opens on a finished result, but
   `Load Captured Fixture` discards the current approved run in that tab.
   - Tab A ("The Moment"): run the whole flow once before recording: load the
     ATL fixture, confirm all four costs, approve, click `Finish baseline`,
     open `Paired comparison`, check all three options, click
     `Rerun Paired Seed`, then return to `Simulation & inspection` so the
     completed telemetry is on screen. Leave this tab alone.
   - Tab B (the six beats): a fresh page load with nothing loaded yet.
5. Reset to a clean state at any time by starting a new job
   (`Load Captured Fixture` again or reload the tab). Restarting the API also
   discards all jobs and approvals in memory. **Never reset or delete the
   database**; old rows are harmless.
6. Do not drag the booth or edit any field in the review step if you want the
   figures above. Any change to position, economics, archetypes, or landmarks
   produces a different configuration hash and different numbers.
7. Dry-run once with a timer. The engine is fast (the full API flow took about
   two seconds in the measured session), so pacing is set by your speech, not
   by waiting on the simulation.

## Shot list (about 90 seconds)

Spoken lines are suggestions. Keep them plain; read values from the screen.

### 0:00 - 0:12 The Moment, part 1: the baseline loss (Tab A, `1 · Vendor Sandbox`)

- **On screen:** panel `03 / RUST BASELINE`, clock `8h 00m / 8h 00m`, badge
  `COMPLETED`. Metric cards: `Gross sales $2,196.00` (`122 units sold`),
  `Net profit -$10,194.80`, `Cash balance -$21,462.80`. Detail row:
  `Inventory outlay $12,000.00`, `Consumed COGS $732.00`,
  `Organizer fee $658.80`. Demand row: `51 Balked queue`, `172 Balked price`.
- **Action:** none; let the viewer read. Optionally hover the cash card.
- **Say:** "This is a modeled festival booth after a full simulated day:
  a net loss of about ten thousand dollars, and over twenty-one thousand of
  cash out the door because all the inventory was bought up front."

### 0:12 - 0:22 The Moment, part 2: the Underwriter Desk halts the outlay (Tab A)

- **Action:** click `2 · Underwriter Desk`. Leave `Audit run` on
  `Approved baseline`.
- **On screen:** `06 / UNDERWRITER DESK`, `POLICY VERDICT` **REJECT**,
  `PROPOSED INVENTORY PREPARATION CAP` **$4,500.00**, the three-row
  `Turnout stress tests` table with `0/15` in every `Break-even k/n` cell, and
  the `Underwriting diff` showing `Inventory preparation: 1200000 cents`,
  `Proposed inventory preparation cap: 450000 cents`, and
  `Current total upfront capital: 2300000 cents`.
- **Say:** "The underwriting desk rejects the twenty-three-thousand-dollar
  upfront plan and counters with a four-thousand-five-hundred-dollar cap on
  inventory preparation. Here is how we got there."

### 0:22 - 0:32 Beat 1: intake with provenance (Tab B)

- **Action:** switch to Tab B. In `01 / EVENT INTAKE`, leave
  `Modeled demo fixture` on `ATL festival` and click `Load Captured Fixture`.
- **On screen:** the progress list fills with milestones ending in
  `Human review required. No simulation has been initialized.`; the header
  badge changes to `CAPTURED · MODELED DEMO`; the sidebar `READ-ONLY EVIDENCE`
  panel shows `Welcome to ATL Experience • Modeled demo` and
  `Actor run None (not a live actor run)`; the sources line reads
  `Map: Deterministic fallback`, `Personas: Deterministic fallback`,
  `Coordinator: Deterministic fallback`.
- **Say:** "We start from a modeled demo fixture, labelled as such. Nothing
  here is live data."

### 0:32 - 0:45 Beat 2: assumptions, map, and human approval (Tab B)

- **On screen:** `02 / HUMAN REVIEW`, heading `Place your bet. Then test it.`,
  badge `NOT SEEDED`, the 1,000 x 1,000 assumption map with `YOUR BOOTH`,
  `Main stage`, `Food court`, `Main entrance`, `Exit`. Right panel
  `EDITABLE ASSUMPTIONS` / `Unit economics`, `Upfront capital $23,000.00`
  (`Booth + prepared inventory + staff/equipment`).
- **Action:** point at the booth and the stage without dragging. Tick the four
  boxes `Confirmed Unit COGS ($)`, `Confirmed Booth fee ($)`,
  `Confirmed Staff + equipment ($)`, `Confirmed Organizer cut (%)`; the
  `Unconfirmed costs remain unknown...` notice disappears. Click
  `Approve Setup & Seed World`. The button briefly reads
  `Initializing Rust + 45 scenarios…`.
- **Say:** "The map and archetypes are assumptions a person reviews and can
  edit. We confirm each cost ourselves, then approve. Only this approval seeds
  the Rust world."

### 0:45 - 0:58 Beat 3: accelerated baseline simulation (Tab B)

- **On screen:** `03 / RUST BASELINE`, badge `PUBLIC SUBSCRIPTION` once the
  browser subscription connects, clock `0h 00m / 8h 00m`,
  `400 subscribed customer rows`.
- **Action:** click `Play` and let it run for about four seconds (dots move;
  the clock advances in 5-minute jumps; legend `Mint: purchased`,
  `Amber: queued`, `Coral: rejected`, `Grey: moving / leaving`). Click
  `Pause`, then click `Finish baseline`. The clock reads `8h 00m / 8h 00m`,
  badge `COMPLETED`, and the metric cards match part 1:
  `$2,196.00`, `-$10,194.80`, `-$21,462.80`.
- **Say:** "Four hundred simulated attendees move, queue, buy, or walk away.
  Every dollar on screen comes from the Rust engine. Pausing and finishing
  does not change the result; same seed, same answer."

### 0:58 - 1:08 Beat 4: pause and inspect one recorded decision (Tab B)

- **Action:** in `Inspect customer`, choose
  `#7 · Budget browsers · decision recorded` (or click a coral dot; if you do,
  read the inspector rather than this script, since another customer's values
  will differ).
- **On screen:** `04 / PAUSED TO INSPECT`, `Customer #7`,
  `Budget browsers · LEAVING`, `Current wallet $18.21 · Patience 123s`,
  `RECORDED AT 3h 40m`, heading `BALKED QUEUE WAIT`, badge
  `Deterministic fallback`, the explanation sentence quoted above, and
  `Raw deterministic DecisionEvent` JSON with `"estimatedWaitSec": 360`.
- **Say:** "Each rejection is a recorded decision we can open: this shopper
  had the money, but a six-minute wait exceeded two minutes of patience. The
  narrative is a fallback explanation; the recorded fields are the facts."

### 1:08 - 1:20 Beat 5: paired intervention comparison (Tab B)

- **Action:** click `Close`, then `Paired comparison`. Check all three:
  `Relocate Booth to Main Stage Artery`, `Add +1 Server (+$300 labor)`,
  `Cap Inventory Prep at $4,500`. Click `Rerun Paired Seed`.
- **On screen:** `05 / PAIRED INTERVENTION`, badge `SAME SEED · SAME HORIZON`,
  `Recorded comparison` with `Seed 42 · 8h 00m · both completed`, and the
  table `Actual Rust results, intervention minus baseline`: Gross sales
  `$2,196.00 -> $2,520.00 (+$324.00)`, Net profit
  `-$10,194.80 -> -$10,376.00 (-$181.20)`, Cash balance
  `-$21,462.80 -> -$14,036.00 (+$7,426.80)`, Inventory outlay
  `$12,000.00 -> $4,500.00 (-$7,500.00)`, Units sold `122 -> 140`,
  Balked queue `51 -> 9`, Balked price `172 -> 172`.
- **Say:** "Same crowd, same seed, different setup. Moving, adding a server
  and capping inventory sells eighteen more units and cuts cash exposure by
  about seventy-four hundred dollars, but the extra labor still leaves profit
  slightly worse. Cash and profit answer different questions."

### 1:20 - 1:30 Beat 6: the risk desk on the intervention (Tab B)

- **Action:** click `Inspect intervention risk`. The view switches to
  `2 · Underwriter Desk` with `Audit run` set to `Latest paired intervention`.
- **On screen:** `POLICY VERDICT` **REJECT**,
  `PROPOSED INVENTORY PREPARATION CAP` **$4,500.00**, stress table
  `LOW 200 0/15 ... -$10,890.80`, `BASE 400 0/15 ... -$10,422.20`,
  `HIGH 560 0/15 ... -$10,085.60`, diff
  `Current total upfront capital: 1580000 cents`, and the footer
  `Modeled outcomes, not forecasts. No funding authorization.`
- **Say:** "Forty-five scenario runs, deterministic rules, and the verdict
  stays REJECT: the cap protects cash, it does not create demand. That is the
  decision before the commitment."

End recording at or before 1:30.

## What not to say

- Do not call the fixture live, scraped, or verified data. It is modeled demo
  data in `CAPTURED` transport mode with no actor run.
- Do not call the policy verdict a funding, loan, or approval decision. It is
  a deterministic recommendation about inventory preparation limits.
- Do not say `-$24,600`, `+$3,120`, or any figure not on screen.
- Do not claim Factory Droid or Claude participated. The badges read
  `Deterministic fallback`; live Droid coordination has not completed an
  end-to-end run.
- Do not claim more about Mana usage than the two linked pages in `README.md`
  show.
- Do not describe the 400 attendees as a sample of 40,000 real visitors or the
  scenario frequencies as calibrated probabilities.
- Do not say the simulation predicts real behavior; the inspector text itself
  says the recorded decision "is not a prediction about my real behavior".

## Manual submission checklist (not done by this repository)

- [x] Mana links are in `README.md` under `## How Mana Changed What We Built`,
      and that section now describes the seven decisions Mana changed. The
      spoken pitch may cite one or two of them, but must not claim anything
      beyond what that section says.
- [ ] Record the 90-second capture using this script. No recording has been
      produced or checked in.
- [ ] Credentialed Droid coordination (`FACTORY_API_KEY` with
      `OFFLINE_MODE=false`) remains unverified end to end. Do not present it as
      working in the recording or the submission text. The manual smoke check
      is `npx tsx scripts/droid-smoke.ts`; it needs network access and an
      exported key, and must not be run in CI.
- [ ] If any figure on screen differs from this document, the engine, fixture,
      or configuration changed: re-measure and update both this file and the
      `README.md` "Measured demo results" table before recording.
