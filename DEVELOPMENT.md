# Development

Everything here runs from a fresh clone with nothing installed but Node 22 and
(for the Go core and the ingest) Go 1.26. No PDS, no database, no keys.

## Run it

```bash
npm install
npm run dev                             # http://localhost:3000
curl localhost:3000/demo/bundles.json   # genuine · birth · tampered · forged
```

With no environment variables set the app comes up in **demo mode**: an
in-memory AT Protocol network built on the same `@atproto/repo` code a live PDS
runs. Real repositories, real signing keys, real signed commits, real MST
inclusion proofs — only the sockets are missing. Browsing is served from an
in-memory index that dies with the process, and the synthetic generator runs by
default, because a generated record there costs nothing.

Paste the `tampered` bundle into `/verify` to see the case the design is built
around: a genuine signature beside a commitment that no longer matches.

To point a local process at the live network instead:

```bash
F8130_MODE=live DATABASE_URL='postgres://…' npm run dev
```

Live mode is checked rather than believed. The process probes
`PDS_INTERNAL_URL` at boot and falls back to the self-contained demonstration
if nothing answers — except in the Railway environment named `production`,
which stays live and read-only rather than serving invented records from a real
domain. See [DEPLOYMENT.md](DEPLOYMENT.md) for the variables each deployed
service needs.

The Go firehose consumer is separate:

```bash
DATABASE_URL='postgres://…' PDS_HOST='wss://f8130.cldixon.dev' npm run ingest -- run
npm run ingest -- reindex    # rebuild the index from sequence zero
```

## Tests

```bash
npm test                 # TypeScript: commitment core, verification pipeline, web, watchdog
go test ./...            # Go: commitment core against the shared vectors, ingest
gofmt -l . && go vet ./...
```

Database-backed tests need a live PostgreSQL. Without the variable they **skip
rather than fail**, so run them with it or CI is the only place they execute:

```bash
F8130_TEST_DSN='postgres://postgres:postgres@localhost:5432/f8130_test?sslmode=disable' \
  go test ./ingest/ && npm test
```

### The cross-language contract

`testdata/vectors.json` is the contract the TypeScript core in `core/` and the
Go core in `commitment/` must both satisfy byte for byte. It is generated from
the TypeScript implementation:

```bash
npm run vectors          # regenerate testdata/vectors.json
git diff --exit-code testdata/vectors.json
```

**That diff must be empty.** CI runs exactly these two lines. A non-empty diff
means a canonicalization or field-order rule changed, which invalidates every
commitment ever published under the current `FIELD_SET_VERSION` — a deliberate
version bump, never a silent drift.

Writing the scheme twice is what makes it a specification rather than a
behaviour. It has already earned its keep: JavaScript's `\s` matches
non-breaking spaces, Unicode space separators and the BOM, while Go's matches
five ASCII characters. A form pasted out of a spreadsheet would have
canonicalized differently in the two languages, and the disagreement would have
surfaced much later as an unverifiable document rather than as a failing test.

### CI

`.github/workflows/ci.yml` runs three jobs: TypeScript (typecheck + tests
against a real Postgres), Go (`gofmt`, `go vet`, tests against a real
Postgres), and the cross-language vector check above. Both database DSNs are
set in CI on purpose — without them the suites would go green having never
touched a query.

## The design system

The interface has one design system and every screen is drawn from it:

| | |
|---|---|
| `web/src/styles/tokens.css` | the vocabulary — palette, type scale, radii, spacing, shadows, motion |
| `web/src/styles/app.css` | the components, written only in terms of those tokens |

Neither the templates nor `app.css` carry a colour, typeface, size or radius of
their own; to change how something looks, change the token. The two files are
read once at startup and inlined into every page, so a page is still a single
request and there is no build step. The fonts — Barlow Condensed for display,
Barlow for text, Space Mono for every identifier — are the one thing fetched
from elsewhere, and each has a system fallback.

There is one palette and it is dark. A light theme existed, was the default,
and was never what this looked right in: the screen is an instrument panel, and
a panel is dark because the reading matters more than the surface it sits on.
Carrying the second theme meant every colour declaring a value nobody saw and
every new colour needing two, so it is gone along with the control that
switched between them.

## Rules that are not negotiable

- **A bundle is never stored, logged or indexed.** Holding bundles would
  rebuild the central repository of commercially sensitive data the whole
  design exists to avoid. No AppView has a table for one.
- **No AppView reads the PDS's disk or database**, even when they share a
  private network. Everything is XRPC and the firehose. Break that once and the
  demonstration becomes a normal database with extra steps.
- **Field order is schema.** `core/src/fields.ts` and `commitment/fields.go`
  are versioned, never edited in place.
- **Nothing is faked into an index.** The synthetic generator writes real
  records through the real write path, so nothing appears in the feed until an
  AppView has independently observed it. The delay is the pipeline working.

## Layout

| | |
|---|---|
| `lexicons/` | the three record schemas |
| `core/` | TypeScript commitment core, bundle, disclosure, seven-stage verification pipeline, in-memory network |
| `commitment/` | Go implementation of the same commitment scheme |
| `ingest/`, `cmd/ingest/` | firehose consumer, signature verification, Postgres index; `run` and `reindex` |
| `web/` | AppView A |
| `watchdog/` | AppView B |
| `seed/` | one-shot job: 29 organizations and the set pieces |
| `spike/` | validation that the atproto verification primitives hold up |
| `testdata/vectors.json` | the cross-language contract |
| `docs/commitments.md` | the commitment scheme from first principles |
