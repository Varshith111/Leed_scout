# LeadScout

A production-grade CLI lead-generation system that discovers businesses **without an official
website** — built for web development agencies looking for prospects.

LeadScout does exactly five things:

1. **Searches** businesses from providers (Google Maps, JustDial, IndiaMART).
2. **Extracts** business information.
3. **Verifies** whether an official website exists.
4. **Stores** only verified businesses, de-duplicated, in Supabase (PostgreSQL).
5. **Exports** the businesses that have no website to CSV, Excel or JSON.

It is not AI lead scoring, not a CRM, not email marketing and not outreach automation.

---

## Status

The application is built in nine phases. **Phases 1 and 2 are complete.**

| Phase | Scope                                                                   | Status      |
| ----- | ----------------------------------------------------------------------- | ----------- |
| 1     | Project setup, TypeScript, ESLint, Prettier, dotenv, Winston, structure | ✅ Complete |
| 2     | Supabase connection, DatabaseService, SQL migrations, runner, seed     | ✅ Complete |
| 3     | CLI commands, job management                                            | ⏳ Next     |
| 4     | Provider architecture, Google Maps provider                             | ⏳ Planned  |
| 5     | Scraping engine, infinite scrolling, business extraction                | ⏳ Planned  |
| 6     | Website verification, Google search verification, domain validation     | ⏳ Planned  |
| 7     | Duplicate detection, export system                                      | ⏳ Planned  |
| 8     | Progress bars, statistics, logging                                      | ⏳ Planned  |
| 9     | Resume jobs, retry logic, crash recovery, performance                   | ⏳ Planned  |

---

## Requirements

| Component | Version            |
| --------- | ------------------ |
| Node.js   | 22 or newer        |
| npm       | 10 or newer        |
| Database  | Supabase (PostgreSQL 15+) |

TypeScript is pinned to the 6.x line: the tooling ecosystem (`typescript-eslint`, `ts-jest`) does
not yet support the TypeScript 7 native compiler API.

## Installation

```bash
npm install
```

```bash
cp .env.example .env
```

Set `DATABASE_URL` in `.env`, then create the schema and default settings:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

Build and run:

```bash
npm run build
```

```bash
node dist/cli/index.js
```

During development, run straight from the TypeScript sources:

```bash
npm run dev
```

> **Password encoding.** `DATABASE_URL` is a URL, so special characters in the password must be
> percent-encoded — `@` becomes `%40`, `:` becomes `%3A`, `/` becomes `%2F`.

## npm scripts

| Script                      | Purpose                                           |
| --------------------------- | ------------------------------------------------- |
| `npm run build`             | Compile `src` into `dist` and copy SQL migrations |
| `npm run dev`               | Run the CLI from source via `tsx`                 |
| `npm start`                 | Run the compiled CLI                              |
| `npm run typecheck`         | Type-check sources, tests and scripts             |
| `npm run lint`              | ESLint with type-aware rules                      |
| `npm run format`            | Format with Prettier                              |
| `npm run db:migrate`        | Apply pending SQL migrations                      |
| `npm run db:migrate:status` | List applied and pending migrations               |
| `npm run db:seed`           | Insert the default settings row (idempotent)      |
| `npm test`                  | Unit + integration tests                          |
| `npm run test:unit`         | Unit tests only (no database required)            |
| `npm run test:integration`  | Integration tests against MySQL                   |
| `npm run test:coverage`     | Tests with a coverage report                      |

## Environment variables

Every variable is validated at startup by a Zod schema (`src/config/env.ts`). Invalid values abort
the process with **all** problems reported at once. Empty strings are treated as "not set".

### Application

| Variable       | Default       | Description                             |
| -------------- | ------------- | --------------------------------------- |
| `NODE_ENV`     | `development` | `development` \| `production` \| `test` |
| `DATABASE_URL` | _(required)_  | Supabase / PostgreSQL connection string (`postgresql://`) |

### Database pool

| Variable                      | Default | Description                                            |
| ----------------------------- | ------- | ------------------------------------------------------ |
| `DATABASE_CONNECTION_LIMIT`   | `10`    | Maximum pooled connections                             |
| `DATABASE_QUEUE_LIMIT`        | `0`     | Queued acquisitions; `0` is unlimited                  |
| `DATABASE_CONNECT_TIMEOUT_MS` | `10000` | TCP connect timeout                                    |
| `DATABASE_IDLE_TIMEOUT_MS`    | `60000` | Idle connections are released after this               |
| `DATABASE_RETRY_ATTEMPTS`     | `2`     | Retries for transient failures (lost connection, lock) |
| `DATABASE_RETRY_DELAY_MS`     | `500`   | Base delay between retries (linear back-off)           |
| `DATABASE_SLOW_QUERY_MS`      | `500`   | Statements slower than this are logged at warn         |
| `DATABASE_LOG_QUERIES`        | `false` | Log every statement at debug level                     |
| `DATABASE_URL_TEST`           | derived | Integration-test database; defaults to `<db>_test`     |

### Logging

| Variable      | Default | Description                                                     |
| ------------- | ------- | --------------------------------------------------------------- |
| `LOG_LEVEL`   | `info`  | `error`/`warn`/`info`/`http`/`verbose`/`debug`/`silly`          |
| `LOG_TO_FILE` | `true`  | Write rotating JSON logs in addition to the console             |
| `LOG_DIR`     | `logs`  | Log directory (relative paths resolve against the project root) |

### Filesystem

| Variable         | Default       | Description                  |
| ---------------- | ------------- | ---------------------------- |
| `OUTPUT_DIR`     | `output`      | Export destination directory |
| `SCREENSHOT_DIR` | `screenshots` | Error screenshot directory   |

### Scraping engine

| Variable                        | Default    | Range         | Description                     |
| ------------------------------- | ---------- | ------------- | ------------------------------- |
| `SCRAPER_WORKERS`               | `4`        | 1–32          | Parallel browser workers        |
| `SCRAPER_HEADLESS`              | `true`     | boolean       | Headless or headed browser      |
| `SCRAPER_BROWSER_TYPE`          | `chromium` | engine        | `chromium`/`firefox`/`webkit`   |
| `SCRAPER_RETRY_COUNT`           | `3`        | 0–10          | Retries per failed operation    |
| `SCRAPER_TIMEOUT_MS`            | `30000`    | 1 000–600 000 | Generic operation timeout       |
| `SCRAPER_NAVIGATION_TIMEOUT_MS` | `45000`    | 1 000–600 000 | Page navigation timeout         |
| `SCRAPER_RATE_LIMIT_PER_MINUTE` | `60`       | 1–6 000       | Requests per minute per worker  |
| `SCRAPER_SCROLL_DELAY_MS`       | `1200`     | 0–60 000      | Delay between infinite scrolls  |
| `SCRAPER_MAX_SCROLLS`           | `250`      | 1–10 000      | Scroll ceiling per search       |
| `SCREENSHOTS_ENABLED`           | `true`     | boolean       | Capture screenshots on failures |

Boolean variables accept `true/false`, `1/0`, `yes/no`, `on/off` (case-insensitive).

### Proxy rotation

| Variable         | Default   | Description                                    |
| ---------------- | --------- | ---------------------------------------------- |
| `PROXY_ENABLED`  | `false`   | Enable proxy rotation                          |
| `PROXY_URLS`     | _(empty)_ | Comma-separated proxies; required when enabled |
| `PROXY_USERNAME` | _(none)_  | Proxy username                                 |
| `PROXY_PASSWORD` | _(none)_  | Proxy password (never printed)                 |

### Website verification

| Variable                          | Default    | Range         | Description                           |
| --------------------------------- | ---------- | ------------- | ------------------------------------- |
| `VERIFICATION_CONCURRENCY`        | `5`        | 1–32          | Parallel verification workers         |
| `VERIFICATION_TIMEOUT_MS`         | `15000`    | 1 000–120 000 | HTTP timeout per check                |
| `VERIFICATION_MAX_SEARCH_RESULTS` | `10`       | 1–50          | Search results inspected per business |
| `VERIFICATION_USER_AGENT`         | _(Chrome)_ | string        | User agent for verification requests  |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ CLI              src/cli                                     │
│ Commander commands, argument parsing, terminal rendering.    │
│ Contains no business logic — it only invokes services.       │
└───────────────────────────────┬──────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────┐
│ Services         src/services                                │
│ ScrapeService, VerificationService, ExportService,           │
│ JobService. All business logic lives here, including the     │
│ SQL each use case needs.                                     │
└──────┬──────────────────────────────────────────┬────────────┘
       │                                          │
┌──────▼──────────────────┐            ┌──────────▼────────────┐
│ Providers               │            │ Verification          │
│ src/providers           │            │ src/verification      │
│ Google Maps, JustDial,  │            │ WebsiteVerifier,      │
│ IndiaMART (Playwright)  │            │ GoogleSearchVerifier, │
│ behind one interface    │            │ DomainValidator       │
└─────────────────────────┘            └───────────────────────┘
       │                                          │
┌──────▼──────────────────────────────────────────▼────────────┐
│ DatabaseService  src/database                                │
│ One mysql2 pool, prepared statements, transactions, health   │
│ checks, reconnect, query logging. Executes all SQL.          │
└───────────────────────────────┬──────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────┐
│ MySQL 8                                                      │
└──────────────────────────────────────────────────────────────┘

Infrastructure: src/config (Zod-validated, layered) · src/logger (Winston)
```

### Principles applied

- **One responsibility per module.** `DatabaseService` owns _how_ SQL reaches the server; services
  own _what_ SQL to run.
- **Dependency injection.** Collaborators arrive through constructors; `src/cli/bootstrap.ts` is
  the single composition root.
- **Prepared statements only.** Every parameterised call goes through `mysql2`'s `execute()`.
  Values are never concatenated into SQL, and `multipleStatements` is disabled on the pool.
- **One pool per process,** created lazily and closed on shutdown.
- **Strict typing.** `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on.

### Configuration layering

Configuration is resolved lowest-precedence first:

1. schema defaults (`src/config/env.ts`)
2. environment variables / `.env`
3. the persisted `Settings` row
4. per-invocation CLI flags (Phase 3)

Layers 3 and 4 are applied through `ConfigService.applyRuntimeSettings()`, the single mutation
point of the configuration system. `ConfigService.describe()` renders a secret-free summary —
database and proxy passwords are always masked.

### Logging

Services depend on the `ILogger` interface only; Winston never leaks past `src/logger`. Every
lifecycle step logs a canonical `LogEvent` (`job.created`, `scrape.business.saved`,
`verify.website.missing`, `export.finished`, …) so logs stay greppable.

- Console: colourised, human-readable, level-filtered.
- Files: `logs/leadscout.log` (all levels) and `logs/error.log` (errors), JSON, rotating at 10 MB
  with 10 generations retained.

## Folder structure

```
leadscout/
├── src/
│   ├── cli/
│   │   ├── commands/              # Commander commands (Phase 3)
│   │   ├── bootstrap.ts           # Composition root
│   │   ├── output.ts              # Terminal rendering helpers
│   │   └── index.ts               # Entry point (bin: leadscout)
│   ├── services/                  # Business logic (Phase 3+)
│   ├── providers/                 # Provider implementations (Phase 4)
│   │   ├── base/  google/  justdial/  indiamart/
│   ├── verification/              # Website verification (Phase 6)
│   ├── database/
│   │   ├── migrations/
│   │   │   ├── 001_initial_schema.sql
│   │   │   ├── 002_indexes.sql
│   │   │   └── 003_constraints.sql
│   │   ├── DatabaseService.ts     # Pool, queries, transactions, health
│   │   ├── MigrationRunner.ts     # Discovery, execution, bookkeeping
│   │   ├── seed.ts                # Default settings
│   │   ├── url.ts                 # Connection-string parsing
│   │   └── index.ts
│   ├── logger/                    # ILogger + Winston adapter
│   ├── config/                    # Zod env schema + ConfigService
│   ├── models/                    # Row types, DTOs, enums, converters
│   └── utils/                     # AppError hierarchy, fs, time helpers
├── scripts/                       # migrate.ts, seed.ts, copy-assets.ts
├── tests/
│   ├── unit/                      # No database required
│   ├── integration/               # Runs against MySQL
│   ├── helpers/                   # Test context, fixtures, truncation
│   └── setup/globalSetup.ts       # Creates + migrates the test database
├── logs/  output/  screenshots/
├── eslint.config.mjs  jest.config.js  .prettierrc.json
├── tsconfig.json  tsconfig.build.json  .env.example
└── package.json
```

## Database

MySQL 8, accessed exclusively through `mysql2/promise` with a single pool.

### Tables

| Table                | Purpose                                                   |
| -------------------- | --------------------------------------------------------- |
| `Jobs`               | One scraping run, with status, progress and live counters |
| `RawBusinesses`      | Every listing exactly as scraped (append-only history)    |
| `VerifiedBusinesses` | De-duplicated, verified businesses — the export source    |
| `Exports`            | One row per generated CSV/Excel/JSON file                 |
| `Logs`               | Persisted application log entries                         |
| `Settings`           | Single row holding the runtime configuration layer        |
| `schema_migrations`  | Applied migrations, with checksums and timing             |

### Relationships

```
Jobs 1 ──── * RawBusinesses      ON DELETE CASCADE
Jobs 1 ──── * Exports            ON DELETE SET NULL
RawBusinesses 1 ──── 0..1 VerifiedBusinesses   ON DELETE RESTRICT
```

`RESTRICT` on the verified table is deliberate: curated leads are never deleted as a side effect of
removing their origin row.

### Duplicate detection

`VerifiedBusinesses` carries a composite unique key `uq_VerifiedBusinesses_identity` on
`(name, address, phone)`. Those three columns are `NOT NULL` with an empty-string default on
purpose: MySQL treats `NULL`s as distinct inside a unique index, which would silently defeat
de-duplication. A second sighting of the same business updates the existing row.

### Indexes

| Table                | Indexed columns                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Jobs`               | `status`, `provider`, `createdAt`, `(status, provider)`                                                                               |
| `RawBusinesses`      | `provider`, `city`, `state`, `category`, `createdAt`, `jobId`, `(provider, providerBusinessId)`                                       |
| `VerifiedBusinesses` | `city`, `state`, `category`, `provider`, `verified`, `hasWebsite`, `rating`, `reviewCount`, `rawBusinessId`, `(verified, hasWebsite)` |
| `Exports`            | `jobId`, `format`, `createdAt`                                                                                                        |
| `Logs`               | `level`, `event`, `createdAt`                                                                                                         |

The composite `(verified, hasWebsite)` index covers the export predicate
`verified = 1 AND hasWebsite = 0` directly.

### Migrations

```bash
npm run db:migrate
```

```bash
npm run db:migrate:status
```

`MigrationRunner` discovers `NNN_name.sql` files in `src/database/migrations`, applies pending ones
in filename order, and records each in `schema_migrations` with a SHA-256 checksum.

- Editing a migration that already ran is a hard error, not silent drift.
- MySQL commits each DDL statement, so an interrupted migration cannot be rolled back. A re-run
  therefore treats "object already exists" as satisfied and converges instead of dead-ending.
- Line endings are normalised before checksumming, so a Windows checkout does not invalidate them.

### Seeding

```bash
npm run db:seed
```

Inserts the single `Settings` row with `workers = 4`, `headless = true`, `retryCount = 3`,
`timeout = 30000`. Idempotent, and it never overwrites values a user has tuned.

## CLI usage

The commands below land in Phase 3; the entry point currently boots the application and prints the
resolved configuration.

```bash
leadscout scrape --provider google --category Restaurants --city Hyderabad --state Telangana --country India --limit 1000
```

```bash
leadscout verify
```

```bash
leadscout export csv
```

```bash
leadscout jobs
```

```bash
leadscout stats
```

```bash
leadscout config
```

```bash
leadscout resume
```

```bash
leadscout pause
```

```bash
leadscout cancel
```

## Error handling

All application errors extend `AppError` and carry a stable `code`, an `isOperational` flag and a
structured `context` bag that is written to the logs: `ConfigurationError`, `ValidationError`,
`DatabaseError`, `NotFoundError`, `ProviderError`, `ScraperError`, `VerificationError`,
`ExportError`, `JobError`.

`DatabaseService` classifies driver failures by following the error `cause` chain: dropped
connections and lock conflicts are retried with linear back-off, while programming errors fail
immediately with the offending SQL attached.

## Testing

```bash
npm test
```

- **Unit tests** cover the environment schema, configuration service (including secret redaction),
  logging adapter, connection-string parsing, error classification, migration parsing and the
  column converters. No database required.
- **Integration tests** run against a real MySQL server: pooling, prepared statements, transaction
  commit and rollback, the composite unique key, every foreign-key delete rule, index presence,
  server-side timestamps, JSON columns, migration bookkeeping and seed idempotency.

The Jest global setup creates and migrates a `<database>_test` database automatically. Test helpers
refuse to truncate a database whose name does not end in `_test`. When MySQL is unreachable the
integration suites skip themselves so `npm test` still passes on a machine without a database.
