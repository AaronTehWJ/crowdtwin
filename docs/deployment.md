# Hosted CrowdTwin demo

The Express process serves the Vite build, API and SSE from one origin. It binds
`HOST` (default `0.0.0.0`) and `PORT` (default `4000`). Use one replica, an HTTPS
reverse proxy/load balancer that supports long requests and SSE, and a persistent
volume mounted at `/app/data`. This is a shared demo, not a multi-tenant service.
Anyone with the demo password shares access to its jobs and can spend provider
credits. Simulation tables are public read-only through SpacetimeDB subscriptions;
do not put private event/customer data in this demo database.

## Database

Use a dedicated database on a server compatible with SpacetimeDB 1.12.0. The Rust
module, generated clients and npm SDK are pinned together; don't independently
upgrade one of them. Maincloud is supported through a configured HTTPS URL, but
this change has not published or verified a Maincloud database. If your cloud
server requires a newer module ABI, migrate the module and both generated clients
before publishing rather than assuming version compatibility.

Authenticate the CLI as the database publisher, then publish to your chosen target:

```sh
scripts/spacetime.sh publish --server "$SPACETIMEDB_URI" --project-path crates/spacetime-module "$SPACETIMEDB_DB_NAME" -y
```

Set `SPACETIMEDB_TOKEN` to a token for that publisher identity. A local-server token
is not a cloud login. Reducers reject identities other than the module publisher.
Never put this token or any provider key into a `VITE_` variable.

## Container

Build from the repository root:

```sh
docker build -t crowdtwin .
docker run --rm -p 4000:4000 --env-file /secure/path/crowdtwin.env \
  -v crowdtwin-data:/app/data crowdtwin
```

Set these server-side environment values in the hosting service's secret manager:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
ALLOWED_ORIGINS=https://your-demo.example
DEMO_PASSWORD=replace-with-a-private-password-of-at-least-16-characters
DATA_DIR=/app/data
SPACETIMEDB_URI=https://your-spacetimedb-server.example
SPACETIMEDB_DB_NAME=your-database-name
SPACETIMEDB_TOKEN=your-publisher-token
OFFLINE_MODE=false
COORDINATOR_MODE=droid
ANTHROPIC_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=your-anthropic-key
APIFY_API_TOKEN=your-apify-token
FACTORY_API_KEY=your-factory-key
DROID_EXEC_PATH=/usr/local/bin/droid
DROID_MODEL=claude-sonnet-4-6
```

The browser prompts for username `demo` and your `DEMO_PASSWORD`. Health checks
can read `/api/health` without credentials. Production startup refuses an absent
password or explicit origin list. Use TLS at ingress; HTTP Basic credentials are
not encrypted by HTTP itself. Keep the container port behind that ingress.

The Docker image includes the checksum-verified Factory CLI 0.249.0. It excludes
`.env`, local databases, captures and build output from the build context.
A Docker daemon is not installed in the development environment, so the image
build itself remains unverified; the equivalent npm build and app tests were run.

## Vite variables

No public variables are required for the recommended single-origin deployment.
The browser obtains the database URL/name from `/api/health`; this lets the same
image run against different databases without rebuilding.

For separate frontend hosting, set at **build time**:

- `VITE_API_BASE_URL`: HTTPS origin of the API, without `/api`.
- `VITE_SPACETIMEDB_URI`: optional override for the public database server URL.
- `VITE_SPACETIMEDB_DB_NAME`: optional matching database name.

Add the frontend's exact origin to `ALLOWED_ORIGINS`. Open the API origin and sign
in first if using the built-in Basic login across origins; browser credential
policies vary. The same-origin deployment avoids that complication. The Vite dev
proxy is configured with `API_PROXY_TARGET`; it has no effect on a production build.

## Live integrations and evidence

`OFFLINE_MODE=true` disables provider calls even with keys configured. An exported
shell value overrides dotenv, so remove `OFFLINE_MODE=true` from old launch commands.
Live Claude failures now return explicit sanitized errors instead of silently
substituting deterministic text. The former Sonnet 4.5 model returned HTTP 404;
Sonnet 4.6 was returned by the account's model list and successfully generated map
and persona output on 2026-10-25.

Live Eventbrite collection accepts arbitrary supported event URLs, captures one
item per run, checks the returned event ID, and allows a 120-second actor run plus
an overall 150-second collection deadline. Luma collection is not implemented by
the Eventbrite actor and returns `UNSUPPORTED_EVENT_PLATFORM`. Capture files go to
`DATA_DIR` when set and do not overwrite the reviewed fixtures.

Two additional real captures were verified on 2026-10-25:

- Day of the Dead festival: run `axlLGndV5QMEbziOi`, dataset `uiJ6NZTaizqtAdtZb`.
- Taste of Latino festival: run `i7zp1u9ezjoQba1r1`, dataset `r8WrknTnDVdfz4Tdn`.

`COORDINATOR_MODE=deterministic` runs the ordered workflow with real Apify and
Claude whenever offline mode is false. It is explicitly labeled deterministic
coordination, not a successful Droid run. `COORDINATOR_MODE=droid` requires a
Factory key and a working tool-boundary check. Factory CLI 0.248.0 and 0.249.0
both left ToolSearch enabled after disabling it. The owner explicitly approved
that discovery tool on 2026-10-25; no other non-application tool is allowed.
The boundary is rechecked before each application handler and unknown permissions
are denied. The default Factory model produced no tool calls, so the app now
selects `DROID_MODEL=claude-sonnet-4-6`. The isolated live Droid intake gate passed
with this model and CLI 0.249.0, stopping at human approval with zero initialized runs.
The SDK 0.10.0 omits execution-mode settings from its high-level options.
`droidTransport.ts` sends direct-only mode, disables scripted subagents and applies
the restrictive allowlist through the pinned CLI 0.249.0 protocol. Keep these
versions together and rerun the manual smoke test before upgrading.
Droid receives one permitted workflow step per turn with low reasoning effort,
and the backend verifies the expected stage before requesting the next step.
Live Droid audit coordination plus Claude audit narratives and recorded-decision
explanations also passed against existing approved SpacetimeDB regression runs.

The combined live API intake also passed on 2026-10-25 for the Day of the Dead
festival: Apify run `8ARN6YTBfbj1YTA68`, coordinator `FACTORY_DROID`, map and
personas `CLAUDE`, ending at `AWAITING_APPROVAL` with no automatic simulation
initialization. Runtime health reported all three providers `VERIFIED` and the
local database `CONNECTED`. This is local live verification, not cloud verification.

Manual verification (billable, never run automatically in CI):

```sh
DROID_EXEC_PATH=/path/to/droid npx tsx scripts/droid-smoke.ts
```

## Persistence and operation

`DATA_DIR` stores workflow drafts, approvals and run metadata atomically with
private file permissions. Approved runs survive API restarts. Interrupted intake
or initialization is marked `INTERRUPTED`; it is not automatically retried or
rebilled. SpacetimeDB retains simulation rows separately. Bookmark the `?job=...` URL shown after intake to reopen the draft or run after
a page refresh without creating another paid job. The metadata file is
bound to a database URL/name and refuses to load against a different target.
Back up the volume and database together. Do not run multiple API replicas against
one workflow file. Existing bounded demo limits (100 jobs and database run limits)
still apply; configure a fresh dedicated demo database/volume when needed rather
than deleting data to bypass a failure.

The health endpoint distinguishes configured credentials, successful calls in the
current process, provider errors, offline mode and unselected Droid coordination.
A cloud URL is not proof of a deployed database: verify health plus a real approved
run and browser subscription after deployment. Actual public deployment still
requires a hosting destination, domain and compatible cloud database credentials.
