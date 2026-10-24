# CrowdTwin implementation specification

Updated 2026-10-24 from `factory_droid_master_build_specification (1).md`.
This repository copy supersedes that earlier build brief. The original brief
contains five build phases, six UI beats, and numbered sections 5 (orchestrator)
and 6 (frontend). Those are different numbering systems. This document names
each deliverable explicitly; the Phase 5–6 completion checklist below covers
paired comparison and underwriting as well as the supporting backend/UI files.

## Architecture and contracts

- One Rust simulation crate, one Express API, one React/Vite studio, local
  SpacetimeDB. Node 22+, Rust 1.90.0, SpacetimeDB module/CLI/client 1.12.0.
- Preserve the public Zod shapes in `packages/contracts/src/index.ts`.
  Companion validation bounds untrusted inputs before simulation.
- Rust owns arrivals, movement, queues, service, accounting, decisions, and all
  scenario runs. TypeScript owns intake, approval, policy, and explanations.
- Integer cents throughout. Gross sales, net profit, cash balance, inventory
  outlay, and consumed COGS are distinct. The $4,500 cap applies only to inventory.
- Baseline and intervention use the same seed, horizon, and customer traits.
  Display actual results; the old brief's -$24,600 / +$3,120 are not targets.
- Only the human approval endpoint can initialize a new world. Models cannot
  confirm costs, approve a world, change financial facts, or transfer funds.

## Delivery phases

1. **Workspace and contracts:** npm workspaces, frozen schemas, companion
   validation, deterministic modeled fixtures, and explicit provenance.
2. **Rust and SpacetimeDB:** six public tables, private mutation authority and
   snapshots, three reducers, deterministic paired runs and 45 scenario runs.
3. **Orchestrator:** validated collection, Claude assumptions and explanations,
   restricted Droid coordination, HTTP API, replayable SSE, human approval.
4. **Studio:** intake, read-only evidence, editable costs/map/personas, approval,
   simulation playback, subscribed telemetry, and recorded-decision inspector.
5. **Paired intervention:** relocation, one additional server with $300 labor,
   and $4,500 inventory cap; compare completed runs with identical seed/horizon.
6. **Underwriting:** LOW/BASE/HIGH results with 15 seeds each, break-even k/n,
   P10 profit, deterministic verdict, inventory diff, and grounded narrative.

Submission remains a separate human step: record the 90-second demo and verify
the public accessibility and actual influence of the supplied Mana links.

## Phase 5 and Phase 6 implementation checklist

- `apps/web/src/components/Comparison.tsx` implements Phase 5. The older
  `VendorSandbox.tsx` filename is not required: `Review`, `Simulation`, and
  `Comparison` split those responsibilities. No duplicate component is needed.
- `Workflow.variant` requires a completed approved baseline, clones its world,
  applies selected changes, uses the original seed/horizon, and reads Rust
  snapshots. The comparison displays sales, profit, cash, COGS, inventory,
  labor, units, and rejection deltas; no outcome is hardcoded.
- `apps/web/src/components/RiskDesk.tsx` implements Phase 6. It checks the run
  identity and all three unique scenario summaries, supports retry, and labels
  the actual narrative/coordinator source.
- `riskPolicy` uses NEEDS_INPUT for unconfirmed costs; REJECT for BASE break-even
  below 50% or organizer cut above 25%; REFER for LOW P10 loss above 30% of total
  upfront capital; otherwise APPROVE as a recommendation only.
- Native engine tests must not link SpacetimeDB's WASM-only host imports.
  Tables/reducers compile for `wasm32`; the same engine remains native-testable.
- Real saved captures must display `CAPTURED · APIFY SNAPSHOT`, with a real run
  reference. Synthetic fixtures display `CAPTURED · MODELED DEMO`.
- Preserve the eight-hour modeled demo separately from replaceable live captures
  so regression checks and the measured demo script remain reproducible.
- Support the captured event's full 32-hour horizon, bounded at 72 hours for all
  events. HTTP/reducer step bounds are 8,640 ticks. The UI explicitly discloses
  that elapsed multi-day spans include overnight time, without closure modeling.

## Orchestrator and external providers (old section 5)

Environment is loaded from `apps/orchestrator/.env`, never from a committed
secret file. `OFFLINE_MODE` defaults to enabled. Explicit `OFFLINE_MODE=false`
is required for live app calls. A manual capture command is an explicit live
operation independent of the running API's offline setting.

### Apify

Actor: `memo23/eventbrite-scraper`. Its current documented input uses **string
URLs**, not the old brief's `{ url: ... }` objects:

```json
{
  "startUrls": ["https://www.eventbrite.com/e/atlanta-handmade-food-small-business-festival-2026-tickets-1995040808764"],
  "maxItems": 1,
  "enrichOrganizer": false,
  "harvestOrganizerEmails": false,
  "monitoringMode": false
}
```

Use HTTPS on exact allowed hosts: `eventbrite.com`, `www.eventbrite.com`, `lu.ma`,
and `luma.com`; reject credentials and nonstandard ports. A successful actor
status is insufficient: require a nonempty dataset and validated evidence.
Normalize dates, venue/address, coordinates, and USD prices; missing prices and
attendance remain unknown. Do not copy organizer emails or raw datasets into Git.

Ordinary live intake caches normalized evidence in ignored
`fixtures/last-live-capture.json` and has a 25-second deadline. Missing keys,
timeouts, and invalid/empty data offer explicit fixture loading; never silently
substitute synthetic evidence. The manual capture script permits 120 seconds
for cold starts and can recover an existing run without another paid execution:

```bash
node --import tsx scripts/capture-apify.ts
# Optional: URL and existing successful actor run ID
node --import tsx scripts/capture-apify.ts EVENT_URL RUN_ID
# Required when the saved capture describes a different event
node --import tsx scripts/capture-apify.ts EVENT_URL --replace
```

The script requires the returned item to match the requested event (Eventbrite
numeric ID and event URL; `WRONG_EVENT` otherwise) and refuses to replace a
capture whose provenance names a different event unless `--replace` is passed.

After validation, write normalized `CAPTURED` evidence to
`fixtures/captured-event.json` and run/dataset metadata to
`fixtures/captured-event.provenance.json`. Preserve the modeled ATL fixture as
`fixtures/modeled-atl-event.json`. `atl` selects the real snapshot; `demo` selects
the stable modeled ATL event; `bay` selects the modeled Bay Area event.

### Claude and Droid

Claude drafts assumptions and adds grounded explanations/cautions. Financial
facts and policy remain immutable; fallbacks are explicitly labeled.
Droid exposes only `collect_event`, `draft_map`, `draft_personas`,
`submit_world_draft`, and `generate_risk_audit`. Use `AutonomyLevel.Off`, discover
and disable non-application tools, deny unknown permissions, verify the tool
boundary, and close sessions. The known credentialed restriction failure must
not be bypassed or presented as a verified integration.

## Studio acceptance (old section 6)

The six beats are intake, assumption approval, baseline playback, inspection,
paired comparison, and underwriting. Keep the persistent provenance badge and
Vendor Sandbox / Underwriter Desk switcher. Render the 1000×1000 assumption map
and Rust customer rows; animation only interpolates recorded positions.
Selecting a dot pauses playback and shows its recorded event plus explanation.
Subscriptions expose no mutation identity. Connection loss pauses playback and
offers reconnect. Show live provider failures with an explicit saved-fixture
action; never label a saved snapshot as a current live request.

## Local setup and verification

The project-local pinned CLI wrapper is `scripts/spacetime.sh`. It uses
`.local/spacetime-1.12.0` for binaries and `.local/spacetime-runtime` for identity
and signing keys. These directories and `.spacetime` are ignored by Git.
The 1.12 installer endpoint returned 403 on this Mac; official binaries are also
available at the [GitHub release](https://github.com/clockworklabs/SpacetimeDB/releases/tag/v1.12.0).
Extract the matching platform archive into `.local/spacetime-1.12.0`.

```bash
export PATH="$PWD/.local/bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
rustup target add wasm32-unknown-unknown
npm ci
npm --workspace=packages/contracts run build
./scripts/spacetime.sh start --listen-addr 127.0.0.1:3000 --data-dir .spacetime --non-interactive
# In another terminal, only if this project has no local publishing identity:
./scripts/spacetime.sh login --server-issued-login http://127.0.0.1:3000
./scripts/spacetime.sh publish --server http://127.0.0.1:3000 --project-path crates/spacetime-module crowdtwin -y
./scripts/spacetime.sh generate --lang typescript --project-path crates/spacetime-module --out-dir apps/web/src/module_bindings -y
./scripts/spacetime.sh generate --lang typescript --project-path crates/spacetime-module --out-dir apps/orchestrator/src/module_bindings -y
```

Configure the API with that publisher's server-issued token, preserving existing
provider keys. Never reset data or replace an existing database's owner to fix
an authorization failure. Never publish without the explicit local server URL.

```bash
npm run verify
SPACETIME_CLI="$PWD/scripts/spacetime.sh" node --import tsx scripts/database-gate.ts
# Start API with OFFLINE_MODE=true and the studio in separate terminals.
OFFLINE_MODE=true npm --workspace=apps/orchestrator run dev
npm --workspace=apps/web run dev
node --import tsx scripts/api-gate.ts
node scripts/studio-gate.mjs
```

The browser gate requires `agent-browser`. Gates create local test runs, never
production data. Run the manual Apify capture separately; do not make network
provider calls part of CI. Real Claude/Droid runs and the submission recording
remain distinct from offline test success.

## Verification record (2026-10-24)

- `npm run verify`: passed; 7 contracts, 14 orchestrator, 20 frontend, 8 Rust tests.
- Local module publication and both generated client bindings: passed, version 1.12.
- Database integration gate: passed; eight-hour modeled results unchanged.
- API gate: passed for the modeled demo and real 32-hour event, including full
  completion, equal-horizon paired variants, and all three audit summaries.
- Browser studio gate: passed all six beats and the expected modeled results.
- Apify run `yJgu1aGVtuTerBN8h`: SUCCEEDED, one normalized event from dataset
  `agXeTSnOzn9vXzISe`; saved in the captured fixture with provenance metadata.
- Not claimed: live Claude/Droid end-to-end success, a submission recording,
  verified public Mana access, or financial guarantees.
