# CrowdTwin: Droid execution brief

Date: October 24, 2026  
Target repository: https://github.com/AaronTehWJ/crowdtwin  
Source inspected: `b9f4648ebfefe6843f82a78c7d3c710a3502fbb0`  
Status: **Superseded at `54a4b00`; see `FACTORY_BUILD_PROMPT.md`.** Disposition: P0.1 replaced by the full-span design (72-hour evidence cap, no simulation window); P0.2 partially implemented (real capture replayable as `atl` with provenance file; no capture store/IDs, no build ID or content hash; `captured-event.json` is replaced by design, guarded by `--replace` since `b68141d`); P1.1 and P1.2 not implemented.

## Mission and boundaries

Make a genuine multi-day Eventbrite capture usable for a bounded, human-approved single-session simulation, and make that capture explicitly replayable without another scrape. Correct the CLI/docs, preserve provenance, and keep underwriting claims grounded in implemented policy.

Work in the conventional repository, not the separate Mana-native prototype. Read `AGENTS.md`, the current manifests and the actual files before editing. Compare current HEAD with the inspected commit and adapt these instructions if code has moved. Report already-fixed items rather than reverting newer work. Use a separate local branch/worktree and preserve unrelated changes.

This brief requests implementation and offline tests. It does not authorize paid provider calls, contacting organizers, publishing, git pushes/PR creation, cloud deployment, external database changes, funding decisions or money transfers. Run the live stage only after the human approves its concrete spend and target environment. Keep secrets out of source, captures, logs and reports. Do not disable local-origin controls or relax Droid tool restrictions to make a demo work.

Do not modify `/workspace/crowdtwin-runtime`, its vendored source, saved runs, or the Mana app. That working prototype uses an older native Rust adapter and modeled fixtures; it is not the repository's Apify + Factory Droid + SpacetimeDB deployment.

## Source-established defects

- `packages/contracts/src/validation.ts`: evidence start/end duration must be positive and at most 72 hours since `54a4b00`. The inspected commit capped it at 12 hours, shorter than all three candidate listings.
- `apps/orchestrator/src/apifyAdapter.ts`: normalizes the entire event span into `durationHours`; successful LIVE results write `fixtures/last-live-capture.json`.
- `apps/orchestrator/src/workflow.ts`: CAPTURED accepts only the named `atl`/`demo`/`bay` fixtures (`atl` replays the saved real capture since `54a4b00`). A fresh live capture still cannot be selected by capture ID.
- `apps/orchestrator/src/server.ts`: the route is `/api/jobs`. Advice using `/jobs` is incorrect; do not rename the working API to match that advice.
- `packages/contracts/src/index.ts` and the normalizer do not preserve organizer follower/event counts.
- `apps/orchestrator/src/policy.ts`: the policy uses confirmed costs, scenario profitability and organizer revenue share, not profile statistics. Its inventory cap is the lesser of $4,500 and configured inventory outlay, not an inferred $1,500.

## Execute in this order

### P0.1 Separate event evidence from the simulation window

**Touch:** contracts and validation; `apifyAdapter.ts`; `workflow.ts`; Rust world/engine/reducer consumers; review UI, run display and exports. Search the entire repository for `durationHours`, `durationSec`, `startIso`, `endIso`, `schemaVersion` and world hashing before changing the contract.

- Preserve the original event `startIso`, `endIso`, offsets and `durationHours`. This duration is elapsed calendar span, including nights, not continuous opening hours. Do not truncate a source event to 8 or 12 hours.
- Split evidence validation from simulation limits. Accept positive source spans up to a documented 90-day operational bound; reject malformed/offset-free timestamps, reversed dates and inconsistent duration. Keep runtime work bounded separately.
- Introduce **WorldSpec v2** with a distinct `simulationWindow`: offset-aware start/end timestamps and an IANA time zone. Treat the window as a reviewed assumption unless a source explicitly supports those operating hours. Derive duration in seconds from its endpoints rather than accepting another contradictory duration field.
- Validate a positive window of at most 12 hours, contained in the event interval, with duration aligned to the existing 30-second tick. Validate the named zone and date-specific offsets, including DST. Leave ambiguous/missing zones for user review rather than silently using the server or browser zone.
- The review screen must display the full source event span beside the chosen simulation window and explain that only this window is being simulated. A proposed first-day window is editable and explicitly marked unconfirmed. Human approval is required before initializing the world.
- Interpret `totalSimulatedAttendees` as literal people during the selected window, not the entire multi-day event. Keep event RSVPs, organizer claims and modeled arrivals separate. Unknown attendance stays unknown until the human supplies an assumption; do not infer it from followers.
- Confirm the cost scope for the selected window: booth fee, inventory, staff/equipment and organizer share. Do not silently prorate multi-day commitments. Existing cost-confirmation flags default to false.
- Derive Rust horizon, arrival schedule bounds, step caps, scenario runs, comparison horizon and UI clock from the simulation window, not from the full source span. Keep the existing seeded engine and accounting semantics otherwise unchanged.
- Include the approved window, zone and cost assumptions in the canonical world hash. Paired variants inherit the same window and seed. Immutable evidence remains immutable during review.
- Add an explicit v1-to-v2 adapter for new jobs created from existing modeled fixtures. Their valid original 8-hour/4-hour intervals can initialize proposed windows. Keep old saved v1 worlds and historical hashes intact; never silently rewrite stored history. Update both TS and Rust contracts and regenerate bindings with the repository's documented toolchain when required.

**Acceptance:** the 32-hour, 56.5-hour and 55-hour source spans below validate as evidence. Each can be reviewed with a valid single-day window. A 13-hour simulation window, out-of-event window, invalid zone, inconsistent offset, nonaligned duration or unconfirmed window cannot initialize a run. Existing fixture economics and seeded results remain unchanged when migrated with equivalent windows.

### P0.2 Preserve a capture and make replay explicit

**Touch:** `apifyAdapter.ts`, intake schemas/workflow, server routes, event-selection UI and tests. Use one capture-storage module rather than parallel loaders.

- Retain named modeled fixtures `atl` and `bay`, unchanged and clearly labeled. Never overwrite `captured-event.json` or `bay-area-event.json` with a new live event.
- Store each successful real capture under a stable safe capture ID in a backend-owned capture directory, ignored by git by default. Keep immutable normalized evidence plus a private raw-payload sidecar and manifest. Write atomically. `last-live-capture.json` may remain a compatibility cache/pointer, but must not be the only retained record.
- Record requested URL, returned/canonical event identity, capture time, Actor ID, actual run ID, dataset ID, actual build/version identifiers when available, normalization/schema version and content hash. If a provider omits a field, record it as unknown; never invent a successful run/build identifier.
- Pin the approved Actor build for live verification. Keep the collection bounded to one validated detail URL and one item, with organizer enrichment/email harvesting/monitoring disabled. Retain explicit deadlines and prevent timed-out work from publishing late captures; abort the Actor when possible. Do not auto-retry paid work.
- Validate returned event identity against the requested event, including the numeric Eventbrite ID. A caller-supplied source URL is not proof that the returned item belongs to it. Wrong-event, discovery-page, empty or malformed results fail visibly and do not enter the replay catalog.
- Extend CAPTURED intake to accept **exactly one** of an existing fixture name or a capture ID. Reject both, neither, unknown IDs, arbitrary filesystem paths and traversal. Add bounded list/detail APIs and a UI selector for captured events. A modeled fixture and a real captured listing must be visually distinct.
- Keep acquisition provenance and execution mode separate: an originally LIVE acquisition remains historically LIVE evidence when replayed in CAPTURED mode. Display original capture time and Actor run alongside the current replay mode. Do not claim it was scraped again.
- Load captures after an orchestrator restart, without storing credentials. Do not imply that this also fixes the separate in-memory jobs/approvals limitation.
- Replaying evidence must never call Apify. If the user selects offline/deterministic replay, no provider is called at all. If Claude/Droid assistance is separately enabled, show that distinction and require the existing spend gate; CAPTURED alone is not proof of zero model calls.

**Acceptance:** save a synthetic collector result into a temporary test directory, restart/recreate the capture store, list and select the same ID, and initialize a review from exactly its immutable evidence. With fake providers that throw on any invocation, offline replay still succeeds. Wrong IDs, malformed evidence, timeout and path traversal produce explicit errors and preserve all existing fixtures/captures. Tests do not use fake Actor IDs in a shipped file labeled as a real capture.


### P1.1 Correct commands, configuration and progress claims

**Touch:** README/runbooks, actual smoke scripts, UI help, `config.ts`, API tests and health presentation as needed.

- Correct examples to `POST http://localhost:4000/api/jobs`; health is `GET /api/health`; progress is `GET /api/jobs/:id` or the existing SSE events route. A `202` is job acceptance, not collection completion or a completed simulation.
- Document `OFFLINE_MODE=false` for intentional live operation and the existing credential names: `APIFY_API_TOKEN`, `ANTHROPIC_API_KEY`, `FACTORY_API_KEY`, plus the actual SpacetimeDB URI, database name and authorized mutation identity configuration. Do not print secret values or create checked-in environment files.
- Distinguish MISSING, CONFIGURED_UNVERIFIED, explicitly OFFLINE/FALLBACK, and actually VERIFIED behavior. A configured key does not prove the service worked.
- Poll through collection and drafting until `AWAITING_APPROVAL` or a terminal error. Do not auto-approve real inputs. After approval, verify a real SpacetimeDB mutation and subscription update instead of treating HTTP success as end-to-end success.
- Keep explicit error messages for bad evidence, unsupported span, missing capture, provider failure and timeout. Do not silently replace a failed live scrape with a modeled fixture.
- Scope documentation carefully: the repo supports this pipeline after verification; the existing Mana-native prototype stays labeled offline/native Rust.

**Route-corrected commands, for the separately approved live stage only:**

```bash
curl --fail-with-body http://localhost:4000/api/health

curl --fail-with-body -X POST http://localhost:4000/api/jobs \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.eventbrite.com/e/atlanta-handmade-food-small-business-festival-2026-tickets-1995040808764","mode":"LIVE"}'
```

Fix and test P0 first. These commands do not themselves enforce a spend cap, configure credentials, approve the world, or prove any provider succeeded.

### P1.2 Keep organizer evidence and underwriting conclusions honest

**Touch:** evidence contract/normalizer, review UI, `policy.ts`, `claudeService.ts`, relevant coordinator prompts and exports.

- Add an optional organizer-profile evidence structure with nullable name/profile URL/follower count/event count/total-attendee count, exact source labels, source URL and observation timestamp. Missing is not zero. Normalize only fields actually returned by a verified provider payload; do not assume field names or fill browser-observed values into an Apify capture.
- Preserve the label “0 events”; do not change it to “0 past events,” “no experience,” or “fraud.” Organizer-wide attendees are not turnout for the selected event. A spelling error is not an attendance model.
- Present such data as due-diligence context. Keep it out of the deterministic underwriting verdict unless the human separately approves a defined policy change. Do not add arbitrary follower thresholds or risk scores.
- Keep `riskPolicy` authoritative. Claude may explain its actual inputs, missing evidence and scenario results, but must not override its verdict, invent causes, or attribute it to fields the policy does not consume.
- Preserve NEEDS_INPUT for unconfirmed required costs. Explain that a 30% organizer cut triggers the existing greater-than-25% rule once costs are confirmed, regardless of event URL. Merely changing to the holiday listing does not create a profitable comparison.
- Label the current inventory cap as a fixed policy guardrail: min($4,500, configured inventory outlay), not a learned optimal amount and not a total-capital cap. Do not hardcode $1,500 from a typo/follower count.
- No hardcoded APPROVE/REJECT by event ID or title. If a contrasting profitable demo is needed, use a separately labeled hypothetical vendor configuration with transparent assumptions and actual simulated results, never a claim that the real event is profitable.
- Keep the historical Big Fat Vegan anecdote separate from the unrelated Atlanta listing. No claim about a real organizer's legitimacy, venue booking or expected turnout was independently established by this research.

**Acceptance:** changing only organizer follower/event counts leaves the numerical policy verdict unchanged. Unknown fields render Unknown. Narratives cite actual policy reasons and distinguish evidence from assumptions. Tests cover NEEDS_INPUT, REJECT, REFER and APPROVE without event-specific overrides.

## Regression and integration test matrix

Use the repository's actual package scripts and Rust workspace structure. Discover test paths from manifests instead of guessing commands. Run offline first and report exact commands and results.

- Evidence: each of the three multi-day intervals, bad timestamps, source-duration mismatch, missing fields, and the documented source-span ceiling.
- Windows: in-range selection; wrong zone/date offset; DST transition; outside-event window; zero/negative/over-12-hour duration; tick alignment; rejected unconfirmed review.
- Migration: existing ATL/Bay fixtures produce equivalent horizons and seeded economics; historical hashes and fixture files are unchanged. TS/Rust serialize and validate the same v2 fields.
- Simulation: no tick goes beyond the selected window; no night activity is implied by the multi-day source span; variants and scenario runner use the approved window. Same seed/world yields identical results.
- Captures: atomic save/reload after restart, explicit selection, immutable provenance, content-hash verification, no arbitrary file access, no source-fixture overwrite, wrong-event rejection, and no late writes after timeout.
- Network: mocked collector tests only by default; deterministic replay has zero provider calls. `/api/jobs` returns 202 and exposes real progress/errors; `/jobs` is not documented as supported.
- UI: full event dates vs simulation window are visible; mode, modeled/captured status, capture time, provider source and unconfirmed assumptions remain legible; approval stays disabled until required window validation/review passes.
- Policy: profile stats do not alter the verdict; unknown costs still gate decisions; cap labels match actual code; simulated success is not marketed as a real-world probability or funding approval.

## Separately approved live verification gate

After offline tests pass, stop and give the human a concise plan containing the exact event URL, Actor/build, maximum provider spend, time limit, intended model calls and target database. If no approved cost ceiling can be enforced, do not launch. No competitor enrichment is required for this smoke test.

Once explicitly approved:

1. Read health; verify the target local/private database and existing mutation authorization. Keep Droid's restricted tool allowlist and fail closed if SDK behavior violates it.
2. Perform one bounded collection. Preserve real run/dataset/build details and raw evidence, validate identity, and record actual elapsed time and failures. If a field is absent, leave it unknown.
3. Reach AWAITING_APPROVAL; show source dates, proposed simulation window, modeled attendance, vendor costs and provider sources to the human. Stop until they approve.
4. Initialize and step the approved world in actual SpacetimeDB. Observe a generated-client subscription update, a real decision event and scenario rows. Native-adapter or deterministic model fallbacks must be reported as fallbacks, not live-provider success.
5. Replay the saved capture without a new Apify run. For exact run reproducibility retain the approved WorldSpec/hash, window and seed; re-drafting a world from the same evidence is not the same experiment.
6. Save a verification report. A failed provider, missing credential or SDK restriction issue is a blocker, not permission to weaken restrictions or silently fabricate results.

## Candidate source observations

Observed directly in a browser on October 24, 2026, around 09:40 America/Los_Angeles. These are public listing observations, **not Apify captures, checked-in attendance, venue confirmation or forecasts**. Recheck before stage use; counts and ticket status can change.

### Atlanta

https://www.eventbrite.com/e/atlanta-handmade-food-small-business-festival-2026-tickets-1995040808764

- Source start: `2026-10-24T11:00:00-04:00`; end: `2026-10-25T19:00:00-04:00`; elapsed span: **32 hours**.
- Atlanta Expo Center North, 3650 Jonesboro Road Southeast.
- David's Events displayed **18 followers** and **0 events**. Ticket status displayed **Sales ended**. Do not equate that status with sold out, canceled or fraudulent.
- A proposed October 24 11:00–19:00 America/New_York window would be 8 hours, but remains a user-reviewed operating assumption, not proof of each day's schedule.

### San Francisco fall market

https://www.eventbrite.com/e/san-fransisco-fall-vendor-market-2026-tickets-2003626292176

- Source start: `2026-11-20T09:30:00-08:00`; end: `2026-11-22T18:00:00-08:00`; elapsed span: **56.5 hours**.
- Sunset Mercantile Emporium, 653 Irving Street; free admission. Organizer name was not displayed in the read, and structured-data name was null.
- The event is listed November **20–22**, not November 20 only. No $1,500 inventory recommendation was established.

### San Francisco holiday market

https://www.eventbrite.com/e/2026-san-francisco-holiday-makers-market-tickets-2000309197657

- Source start: `2026-11-06T10:00:00-08:00`; end: `2026-11-08T17:00:00-08:00`; elapsed span: **55 hours**.
- Venue is listed as Irving Street without a specific street number.
- LA Makers Collective displayed **31 followers, 4 events, 108 total attendees** at organizer level. These do not establish this event's expected attendance or profitability.

## Completion report required from Droid

Return:

1. Branch and base commit; changed files grouped by task.
2. Implemented contract/migration decisions and compatibility behavior.
3. Exact test commands with pass/fail counts; separate executed tests from source inspection.
4. One reproducible offline workflow and the corrected live runbook.
5. Captured evidence/replay paths, schema version and provenance handling, without secrets or unnecessary personal data.
6. Remaining blockers and a distinct live-verification status: NOT RUN, FAILED, or VERIFIED with evidence. Do not mark the full pipeline verified because mocks pass.
7. Screenshots or a short recording of review-window selection, explicit capture replay and the truthful risk explanation, if the environment supports UI testing.

Do not push or deploy automatically. Finish with a reviewable local diff and the report.
