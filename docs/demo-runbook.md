# CrowdTwin laptop demo runbook (loopback-only)

Cold-start procedure for running the 90-second demo on one laptop. Everything
binds to loopback (`127.0.0.1`) only; the demo runs fully offline against
local fixtures and needs no provider keys, no credentials, and no network
after the one-time install.

This runbook complements [`README.md`](../README.md) "Run locally" (full
detail) and [`docs/demo-script.md`](demo-script.md) (the measured shot list
and spoken-line guidance). The figures you must see on screen are in
`docs/demo-script.md`; do not quote numbers that differ from it.

## What only you can do (manual preflight)

1. **Toolchain present:** Node.js 22+, npm, Rustup with the pinned toolchain,
   and the SpacetimeDB CLI available (the repo carries a pinned copy under
   `.local/`; `scripts/spacetime.sh` wraps it). One-time install commands are
   in step 0 below and require network.
2. **Terminals:** keep four terminals (or tabs) open, one per long-running
   process. Do not background them; you want their logs visible during the
   demo.
3. **Environment file:** run `node scripts/setup-local-env.mjs` once. It
   creates `apps/orchestrator/.env` (mode `0600`) with `OFFLINE_MODE=true`
   and refuses to overwrite an existing file. Never print or commit it.
4. **Publish the module** once per machine (and again only after Rust schema
   or reducer changes). Never reset or delete `.spacetime/` to work around a
   failure.
5. **Browser:** open `http://127.0.0.1:5173`, window about 1440 x 1000. In
   `Saved event fixture` choose `ATL festival · modeled demo` (the `demo`
   fixture), **not** `Atlanta festival · Apify snapshot`.
6. **Recording:** follow `docs/demo-script.md`. Its pre-flight checklist
   (two prepared tabs, header reads `Offline providers`) and its "What not
   to say" list are part of the demo.

## 0. One-time setup (needs network)

From the repository root:

```bash
rustup toolchain install 1.90.0 --profile minimal --component rustfmt --target wasm32-unknown-unknown
export PATH="$PWD/.local/bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
./scripts/spacetime.sh --version   # expect 1.12.0

npm install
npm --workspace=packages/contracts run build
node scripts/setup-local-env.mjs
```

The `PATH` export is needed in every new terminal that calls
`scripts/spacetime.sh`.

## 1. Terminal 1: SpacetimeDB (127.0.0.1:3000)

```bash
./scripts/spacetime.sh start --listen-addr 127.0.0.1:3000 --data-dir .spacetime --non-interactive
```

First time on a machine, in a separate terminal while the server runs:

```bash
./scripts/spacetime.sh login --server-issued-login http://127.0.0.1:3000
./scripts/spacetime.sh publish --server http://127.0.0.1:3000 --project-path crates/spacetime-module crowdtwin -y
```

On later demo days the module is already published; skip the login/publish
pair unless the Rust module changed (then republish and regenerate bindings
per `README.md`). Use the same publishing identity every time; do not reset
the database.

## 2. Terminal 2: Orchestrator API (127.0.0.1:4000, offline)

```bash
npm --workspace=apps/orchestrator run dev
```

`OFFLINE_MODE=true` comes from `apps/orchestrator/.env`; in offline mode the
API makes no external provider calls even if keys are present. Verify:

```bash
curl --fail http://localhost:4000/api/health
```

Expect `ok: true`, `offline: true`, `spacetime: "CONNECTED"`, and
`OFFLINE_DISABLED` for each external provider. If `spacetime` is not
`CONNECTED`, the database or the published module is missing; go back to
terminal 1.

## 3. Terminal 3: Studio (127.0.0.1:5173)

The API must already be healthy; Vite proxies `/api` to it.

```bash
npm --workspace=apps/web run dev
```

Open `http://127.0.0.1:5173`. The header status should read
`Offline providers`.

## 4. Optional terminal 4: readiness gates

Run these before recording to confirm the repo state still reproduces the
measured figures (database, API, and studio must all be running):

```bash
npx tsx scripts/api-gate.ts       # offline demo gate + captured 32h gate
node scripts/studio-gate.mjs      # drives the six beats in a browser
```

Both must report `passed`. `studio-gate.mjs` needs the `agent-browser` CLI on
`PATH` and writes only to the ignored `test-results/` directory. If any figure
on screen differs from `docs/demo-script.md`, stop and re-measure before
recording (see the checklist at the end of that file).

## Demo flow once everything is up

1. Confirm the header reads `Offline providers`.
2. Prepare Tab A (finished result) and Tab B (six beats) exactly as the
   pre-flight checklist in `docs/demo-script.md` describes.
3. Record the shot list. Expected figures: baseline 122 units,
   $2,196.00 gross, -$10,194.80 net, -$21,462.80 cash, $12,000.00 inventory
   outlay; combined intervention 140 units, $2,520.00 gross, -$10,376.00 net,
   -$14,036.00 cash, $4,500.00 outlay; verdict REJECT with a $4,500.00
   proposed cap.

## Shutdown

Stop the studio, then the API, then SpacetimeDB with `Ctrl-C` in each
terminal. Database rows persist in `.spacetime/`; restarting the API discards
in-memory jobs and approvals, which is a safe way to reset the demo to a
clean state. Never delete `.spacetime/`.

## Boundaries for the demo machine

- Loopback only: do not pass `--listen-addr 0.0.0.0` or expose any port.
- Do not set `OFFLINE_MODE=false`, do not export provider keys, and do not
  run `scripts/droid-smoke.ts` or `scripts/capture-apify.ts`; the demo does
  not need them and both are credentialed/paid paths.
- The `Deterministic fallback` badges and the offline runtime note are
  intentional; per `docs/demo-script.md`, do not claim live Droid or Claude
  participation.
