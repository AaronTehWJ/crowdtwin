# CrowdTwin repository guide

CrowdTwin is a spatial vendor-economics simulator with local and hosted shared-demo configuration.
Read `README.md` for current delivery status, setup, measured results, and blockers.
The React/Vite studio is delivered; its gates are the web vitest suite, typecheck,
build, and `scripts/studio-gate.mjs`. Live Droid intake passed on 2026-10-25 with CLI 0.249.0, explicit Sonnet 4.6,
and the owner-approved ToolSearch discovery exception. Report each live gate
separately; never infer provider verification from mocks or key presence. `docs/demo-script.md` quotes
measured engine output; re-measure it whenever the engine, fixtures, default
world, or policy change.

## Ownership and invariants

- Keep one Rust crate, one Express process, one React/Vite app, and a configured
  SpacetimeDB server. Do not introduce distributed jobs or multi-tenant authentication.
- Rust owns movement, decisions, accounting, and all scenario runs. Reuse
  `crates/spacetime-module/src/engine.rs`; do not implement a second simulator in
  TypeScript or hardcode demo profits.
- TypeScript owns intake, approval gates, deterministic policy, and explanations.
  Claude and Droid must not alter simulation facts or policy verdicts.
- Preserve the supplied Zod 3 shapes in `packages/contracts/src/index.ts`.
  Put stricter checks in companion validation and bound external input before
  schema traversal. Money is integer cents; coordinates are normalized `0..1000`.
- Keep gross sales, net profit, cash balance, inventory outlay, and consumed COGS
  distinct. The $4,500 cap applies to inventory preparation, not total capital.
- Keep local `agent_id` traits stable across paired runs; use run-scoped storage
  keys. Preserve service progress and step-chunking determinism.

## Safety boundaries

- Only the human approval endpoint may initialize a newly approved world.
  Variants derive from an approved, completed baseline with the same seed/horizon.
  Recompute configuration hashes server-side; unknown costs are not zero.
- Keep the publisher mutation identity out of browser code. Publish only with an
  explicit `--server` targeting the user-selected database server. Never reset data to bypass a failure.
- `OFFLINE_MODE=true` must prevent external provider calls even when keys exist.
  Live failures must offer explicit fixture loading, never silently substitute it.
- Modeled fixtures (`demo`, `bay`) are labelled modeled demo data in `CAPTURED`
  mode with `actorRunId: null`. `fixtures/captured-event.json` is a real
  normalized capture; its run ID must match
  `fixtures/captured-event.provenance.json`. Never invent actor-run IDs, Mana
  links, model usage, live verification, or funding.
- Keep Droid at `AutonomyLevel.Off`, discover tools before prompting, disable tools
  outside the application set (ToolSearch metadata discovery is explicitly allowed
  by the owner), deny unknown permissions, and close sessions. Verify the boundary
  before prompting and again before each application tool action.
  Fail closed if the tool boundary cannot be enforced.
- Never commit `.env`, mutation tokens, `.spacetime/`, runtime captures
  (`fixtures/last-live-capture.json` and raw actor datasets; the reviewed
  `fixtures/captured-event*.json` are tracked), or build artifacts. Do not log
  secrets or raw provider datasets.
- `scripts/droid-smoke.ts` is a manual credentialed check needing an exported
  `FACTORY_API_KEY` and network. Never run it in CI or without explicit
  authorization, and never commit its output.
- `scripts/capture-apify.ts` is a manual, paid Apify call. Never run it in CI or
  without explicit authorization. It refuses to replace a capture of a different
  event unless `--replace` is passed.

## Commands and generated files

Run from the repository root. Use Node 22+, Rust 1.90.0, and matching SpacetimeDB
1.12.0 module/CLI/client versions. Retain both npm and Cargo lockfiles.
`scripts/spacetime.sh` is the owner's pinned-CLI wrapper; a matching `spacetime`
on `PATH` is equivalent.

```bash
npm install
npm --workspace=packages/contracts run build
npm --workspace=packages/contracts test
npm --workspace=apps/orchestrator test
npm --workspace=apps/web test
npm run typecheck
npm run build
cargo fmt --manifest-path crates/spacetime-module/Cargo.toml --check
npm run test:rust
npm run verify
```

Run the narrow checks relevant to each change. For documentation-only changes,
verify paths, commands, claims, and `git diff --check`; do not claim unrun tests.
There is no dedicated lint command.

`npm --workspace=apps/web run dev` serves the studio on `127.0.0.1:5173` and
proxies `/api` to the running API.

Never hand-edit either app's `src/module_bindings/`. After Rust schema/reducer
changes, run Rust tests, publish locally, regenerate both clients, and type-check:

```bash
spacetime publish --server http://127.0.0.1:3000 --project-path crates/spacetime-module crowdtwin -y
spacetime generate --lang typescript --project-path crates/spacetime-module --out-dir apps/web/src/module_bindings -y
spacetime generate --lang typescript --project-path crates/spacetime-module --out-dir apps/orchestrator/src/module_bindings -y
npm run typecheck
```

For database/API changes, also run these with the local services running, following
the README setup. They mutate test runs; do not use a shared database.

```bash
SPACETIME_CLI="$(command -v spacetime)" npx tsx scripts/database-gate.ts
npx tsx scripts/api-gate.ts
```

For studio changes, also run the browser gate with the database, offline API, and
Vite dev server running and the `agent-browser` CLI on `PATH`. It writes only to
the ignored `test-results/` directory and asserts the measured demo figures.

```bash
node scripts/studio-gate.mjs
```

## Delivery

- Inspect Git status before editing. Preserve existing and untracked work; stage
  only the files belonging to the requested chunk.
- Follow the approved phase order and required gates. Stop at unresolved gate,
  authentication, or remote-conflict failures instead of bypassing them.
- Use a durable DATA_DIR volume and one API replica for hosted workflow persistence.
- Run focused checks, review the staged diff and status, then commit when
  authorized. Use the configured Git identity and include:
  `Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>`.
- Push to `origin/main` only when authorized. Never force-push or rewrite
  published commits. Do not push failing work or credential-dependent success
  claims that have not been verified.
