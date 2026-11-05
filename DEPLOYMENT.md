# Deployment

Every service is built from this one repository. That makes one thing
important and non-obvious:

**Railway's Config as Code overrides service settings.** A `railway.json` at
the repository root applies to *every* service built from the repo, so a root
config naming `web/Dockerfile` silently makes the ingest service build and run
a second copy of the website — which is exactly what happened the first time.
There is no root `railway.json` for that reason. Each service points at its own
config file instead, set once per service in Railway under
**Settings → Config file path**:

| service | config file path | notes |
|---|---|---|
| `offwing-web` | `web/railway.json` | public; healthcheck `/api/health`; sleeps when idle |
| `ingest` | `ingest/railway.json` | no public domain; restarts always |
| `seed` | `seed/railway.json` | one-shot; watch patterns limited to `seed/**` |
| `pds` | — | Docker image `ghcr.io/bluesky-social/pds`, pinned to a version |
| `Postgres` | — | Railway template; the AppView's index |

After that, pushes to the tracked branch deploy every service automatically.

## Keeping the bill small

Railway charges for memory held, not requests served, so an always-on
container costs the same whether anyone visits or not. Two settings follow
from that:

- **The web service sleeps.** `sleepApplication` is set in `web/railway.json`
  (config as code, so it wins over the dashboard). Railway puts it to sleep
  after about ten minutes without outbound traffic and wakes it on the next
  request, so the first visitor after a quiet spell waits a few seconds for
  boot. It can sleep because nothing in it runs on a timer: the feed polls the
  index only while a viewer holds the stream open, the page closes that stream
  when its tab goes idle or hidden, and the synthetic generator stops with the
  last viewer. Keep it that way — a background interval in the web process
  would keep it awake around the clock.
- **The PDS, ingest and Postgres cannot sleep.** The firehose is only a
  firehose if something is listening, and a PDS must answer identity lookups at
  any hour. They are the floor.

The PDS image is pinned to a release tag rather than `latest`, so a restart
never upgrades it unannounced. To upgrade, pick the newest numbered tag from
the [package page](https://github.com/bluesky-social/pds/pkgs/container/pds),
read the release notes, and change the service's image in Railway. Back up the
`pds` volume first: it holds every organization's signing keys, and the
`did:plc` registrations they control are permanent.

## Variables

The web service comes up correct with none set. The others need:

| service | variable | value |
|---|---|---|
| ingest | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| ingest | `PDS_HOST` | `ws://pds.railway.internal:3000` |
| web | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| web | `F8130_MODE` | `demo` until the PDS has data, then `live` |
| web | `PDS_INTERNAL_URL` | `http://pds.railway.internal:3000` — without it, read-only |
| web | `SEED_ACCOUNT_PASSWORD` | the demonstration accounts' password, for signing |
| web | `ANTHROPIC_API_KEY` | optional; narrates Blocks 7 and 12 |
| web | `F8130_ACTIVITY` | `1` to run the generator in live mode |

`F8130_MODE=live` is a request rather than a guarantee. The web service probes
`PDS_INTERNAL_URL` at boot and runs the self-contained demonstration if nothing
answers, except in the environment named `production`, which stays live and
read-only rather than serving invented records from a real domain. That is why
pull-request previews work: they inherit `live` from production and are cloned
without the `pds` service.

Railway's private network is IPv6-only and is **not** TLS-terminated, hence
`ws://` and `.railway.internal` rather than `wss://` and a public hostname.

## Optional: AppView B, the watchdog

The default deployment runs one AppView. The second, `watchdog/`, is kept in
the repository, built and tested in CI, but not deployed, because it is three
more always-on containers (the app, its own firehose consumer and its own
Postgres) for a demonstration whose bill is mostly idle memory. Nothing else
depends on it: the web app never calls it. The synthetic generator still
plants its suspicious records; without the watchdog there is simply no second
observer flagging them.

To bring it back, add three services:

| service | config file path | notes |
|---|---|---|
| `watchdog` | `watchdog/railway.json` | public; healthcheck `/health` |
| `watchdog-ingest` | `ingest/railway.json` | AppView B's own consumer |
| a second Postgres | — | Railway template; AppView B's own index |

| service | variable | value |
|---|---|---|
| watchdog | `DATABASE_URL` | the second Postgres's `DATABASE_URL` |
| watchdog | `PEER_APPVIEW_URL` | optional; the main AppView's public URL, linked from its pages |
| watchdog-ingest | `DATABASE_URL` | the second Postgres's `DATABASE_URL` |
| watchdog-ingest | `PDS_HOST` | `wss://f8130.cldixon.dev` — the **public** firehose, on purpose |

Keep the second index in its own database. An observer that shares the main
AppView's index is not independent, which is the whole reason it exists. The
index is derived, so a fresh database fills itself from the firehose; it does
not need to be restored.

## Manual steps

Two things cannot be done through the API:

1. **A volume on the `pds` service**, mounted at `/pds`. Without it the PDS
   crashes on boot with "Cannot open database because the directory does not
   exist" — SQLite has nowhere to live.
2. **DNS records** for the PDS hostname. See the project README.

## The seed is not a normal service

It writes records, and Railway redeploys services on every push. An unrelated
commit therefore wrote a second complete set of parts into the demonstration
before anyone noticed — the deployment was green throughout.

Two guards now: the seed refuses to write when an organization already holds
records (`SEED_RESET=1` clears and rewrites, `SEED_FORCE=1` adds another set),
and its watch patterns are limited to `seed/**` so unrelated commits do not
redeploy it at all.

Those guards mean **expanding the cast does not take effect on its own.** The
seed sees that organizations already hold records and stops, which is the
correct behaviour for an unrelated push and the wrong one after a roster
change. Set `SEED_RESET=1`, redeploy the seed, then unset it — the run
clears every f8130 record from every organization in the roster and rewrites
the whole demonstration.

`SEED_RESET` deletes records, never accounts. Every `did:plc` already
provisioned is reused, which matters because those registrations are permanent
and public: a roster change that renamed an existing handle would strand its
identity and orphan every record it ever signed. The roster tests assert the
five original handles are still present for exactly that reason.

## The CAGE code needs one reindex

The `actor` table gained a `cage` column when account pages were built. The
schema statement is idempotent and adds it to a live database on the next
boot, so nothing breaks and no data is lost — but the column arrives empty for
every organization already indexed, because a station record is written once at
provisioning and the firehose has no reason to replay it. The observer's
self-repair does not cover this either: it fetches a missing profile only when
it holds no display name, and these rows have one.

So the value arrives on a rebuild. Set `F8130_REINDEX=1` on `ingest`, redeploy,
then unset it; the index is rebuilt from sequence zero, every station record is
re-read, and the CAGE codes land. Nothing else depends on it — until then the
account pages simply show one fewer fact than the organizations published.

Station profiles are the one thing a reindex cannot recover from the firehose,
because they are written once at provisioning and never again. The ingest
fetches a missing one directly over `com.atproto.sync.getRecord` — verified
against the repository's signed commit, not taken on the server's word — so a
rebuilt index repairs its own display names without a re-seed.

Re-seeding rewrites the log, so every AppView index (both, if the watchdog is
deployed) should be rebuilt afterwards rather than left holding records whose
URIs no longer exist.
