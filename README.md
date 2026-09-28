# Mtaa Connect

Mtaa Connect connects residents in Tanzania with authorized Mtaa leadership through SMS. Residents are database records, not Auth users. The subscription is TSh 3,000 for six calendar months.

## What is implemented

- Administrator login with Supabase Auth and live profile/status checks.
- Super Admin dashboard, location creation, Mtaa administrator creation/assignment/suspension, and resident registration across Mitaa.
- Mtaa Admin dashboard, registration/editing/approval/suspension within the assigned Mtaa.
- Super Admin creation and assignment of Mtaa Chairperson/Admin and Registration Agent accounts. Agents have a separate restricted workspace, can register residents only in their assigned Mtaa, and see only their own registration/payment/commission totals.
- An immutable commission ledger credits an agent TSh 300 exactly once after an agent-originated TSh 3,000 payment is verified. Pending/failed payments earn nothing; actual payout transfer awaits a documented payout-provider integration.
- Cascading Region → District → Ward → Mtaa → Balozi selections; categories limited to two; consent required; normalized Tanzanian phone numbers. Names and phone numbers are not resident identity keys, so household members may share either.
- Resident forms allow selecting an existing Mtaa/Balozi or saving a new one inline. Choose a ward, click **Ongeza mtaa mpya**, enter the name and click **Hifadhi na uchague**; then select or add a Balozi area. New locations are saved immediately and remain available for future registrations even if the resident form is abandoned. Only Super Admins create Mitaa; Mtaa Admins can create Balozi areas only within their assigned Mtaa. Existing audited database operations enforce these permissions.
- Administrator-defined grouping fields (for example "Aina ya biashara"). Each field holds selectable options, a resident stores at most one option per field, and campaigns can target a selected option. Super Admins create platform-wide fields; Mtaa Admins create fields for their own Mtaa. Managed under **Vikundi**.
- Balozi is optional during public and administrator registration. Residents without a known Balozi still belong to a required Mtaa and can receive eligible Mtaa/group campaigns; Balozi-targeted campaigns include only residents assigned to that Balozi.
- Resident search, Balozi/category/group/subscription/approval filters and server-side pagination.
- PostgreSQL migrations, least-privilege grants, RLS, transactional administrative operations and audit logs.
- Real ClickPesa USSD-PUSH requests, trusted verified-payment activation, six-month renewals, idempotent reconciliation and a development-only mock adapter.
- Campaign preview/confirmation, eligible-recipient targeting (all, Balozi, category, Balozi+category, **custom group** and selected residents), queue claims, configurable welcome SMS and delivery records.
- Production ClickPesa and Gramvista adapters, an authenticated SMS worker, signed webhooks, and per-Mtaa Gramvista credentials encrypted at rest.

**Hosted database action is required.** The app is linked to Mtaa Connect project `mjeludbywzefsawultaj`, but the Supabase account currently signed into the CLI no longer has access to that project. The new per-Mtaa SMS migration is therefore tested locally but not deployed. Sign in with the owning/collaborator account before running `db push`; do not relink this app to the separate Mteja Connect or Gramvista SMS projects.

This release supports **administrator-assisted and public self-registration** at `/register`. Residents do not log in. Public submissions create a pending resident and a TSh 3,000 payment request; only verified payment plus Mtaa approval enables SMS eligibility. ClickPesa and Gramvista are integrated, but real Gramvista sending still requires an approved Sender ID, funded wallet, production API key and deployed worker. No demo residents are inserted.

## Stack and structure

Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn-compatible reusable components, Supabase PostgreSQL/Auth, Zod and React Hook Form. Node.js 24 is required.

```text
src/app/
  login/                       Administrator sign-in and configuration help
  register/                    Public self-registration and private payment receipt
  agent/                       Restricted registration, earnings and settings workspace
  admin/                       Role-aware dashboard
    residents/                 Search, register, edit, approve, suspend
    locations/                 Regions, districts, wards, Mitaa, Balozi, categories
    groups/                    Custom grouping fields and values for targeting
    administrators/            Super Admin account management
    subscriptions/             Payment request history
    campaigns/                 Preview, confirm, queue and delivery history
    audit/                     Read-only administrative history
    settings/                  Password and welcome template
  api/
    locations/                 Authenticated cascading lookups
    public/locations/          Public names/IDs only; no resident information
    resident-options/          Paginated eligible-recipient lookup
    webhooks/payments/          Verified provider callback boundary
    webhooks/sms/               Verified delivery callback boundary
    internal/worker/            Authenticated batch/maintenance entry point
src/features/                  Validation, auth and server actions
src/components/                Reusable UI and administrator forms
src/lib/supabase/               User clients and server-only service client
src/services/                  Payment/SMS interfaces and provider boundaries
src/i18n/                      Centralized Swahili administrator copy; public SW/EN dictionaries
src/types/                     Domain result types
supabase/migrations/            Sixteen ordered SQL migrations
supabase/seed.sql               No location or resident seed data
scripts/                       Setup, first Super Admin and location import
```

The current administrator interface is Swahili. The public dictionary includes English; administrator English translation and a language switcher remain future work. Public API credentials are bundled at build time; private credentials are imported only by server code.

## 1. Connect the correct Supabase project

In a local terminal, sign in with an account that has access to **Mtaa Connect**:

```powershell
npx.cmd supabase@2.117.0 login
npx.cmd supabase@2.117.0 projects list
npx.cmd supabase@2.117.0 link --project-ref mjeludbywzefsawultaj
```

The project must appear in the signed-in account. If it does not, ask its owner to grant access or sign in to the correct account. A project URL or public anon key is not migration authorization. Enter any requested database password locally, not in chat or source code.

Before applying, inspect the target project's current schema and migration history. Do not point these migrations at the unrelated Mteja Connect or Gramvista SMS projects.

```powershell
npx.cmd supabase@2.117.0 migration list
npx.cmd supabase@2.117.0 db push --dry-run
npx.cmd supabase@2.117.0 db push
```

Review dry-run results first. These migrations create product tables, policies and functions; they do not drop working product tables. The sixteen files cover core data/RLS, subscription/payment/SMS processing, rate limits/settings, first-admin bootstrap, search indexes, location provenance/import, public registration, custom groups, restricted agents/commissions, ClickPesa retries and reconciliation, shared household identities, separate payer phones, and per-Mtaa SMS settings. Standard categories are included in the core migration. The database contains 31 regions, 150 districts and 4,344 wards/shehia; see docs/location-data.md for source details and limitations.

Do not use `db reset` on a hosted database. For isolated LOCAL development with Docker Desktop:

```powershell
npx.cmd supabase@2.117.0 start
npx.cmd supabase@2.117.0 db reset
```

Local reset deletes local database data. Docker/Podman is not installed on the current machine; database tests instead execute migrations in PGlite's PostgreSQL engine with simulated Supabase roles. This does not replace a real Supabase staging check.

## 2. Configure .env.local

If it does not already exist, copy `.env.example` to `.env.local`. Do not overwrite configured values.

When opening the development app from another device, set `NEXT_DEV_ALLOWED_ORIGINS` in `.env.local` to your computer's network IP (for example `192.168.1.62`, without a scheme or port), then restart `npm.cmd run dev`. Multiple hostnames can be comma-separated. This allows Next.js development scripts to load so forms and cascading dropdowns work over the network; it does not change production authorization. On the development computer, `http://localhost:3000` works without this setting.

Required for administrator workflows:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://mjeludbywzefsawultaj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_public_publishable_or_anon_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=your_server_only_secret_or_service_role_key
PAYMENT_PROVIDER=clickpesa
CLICKPESA_API_BASE_URL=https://api.clickpesa.com/third-parties
CLICKPESA_CLIENT_ID=your_clickpesa_client_id
CLICKPESA_API_KEY=your_clickpesa_api_key
CLICKPESA_CHECKSUM_KEY=your_clickpesa_checksum_key
GRAMVISTA_SMS_API_URL=https://sscleaiwktklkuxqqndf.supabase.co/functions/v1/public-api/v1
GRAMVISTA_SMS_API_KEY=your_server_only_gramvista_api_key
GRAMVISTA_SMS_SENDER_ID=MTAACONNECT
GRAMVISTA_SMS_WEBHOOK_SECRET=your_gramvista_webhook_secret
SMS_CREDENTIAL_ENCRYPTION_KEY=base64_encoded_32_byte_key
SMS_PROVIDER=gramvista
WORKER_SECRET=your_random_secret_at_least_32_characters
ALLOW_MOCK_PROVIDERS=false
```

Use Supabase's public publishable key or legacy anon JWT for `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The server key must never use a `NEXT_PUBLIC_` name. `.env.local` is Git-ignored. `npm run check:env` validates public settings without printing supplied values; privileged operations also require the server key.

Integration settings:

| Setting | Purpose |
| --- | --- |
| `CLICKPESA_CLIENT_ID`, `CLICKPESA_API_KEY` | Server-only credentials for token generation |
| `CLICKPESA_CHECKSUM_KEY` | Optional server-only HMAC key when canonical checksums are enabled for the ClickPesa application |
| `CLICKPESA_API_BASE_URL` | Locked by the adapter to ClickPesa's official HTTPS API origin |
| `PAYMENT_WEBHOOK_SECRET` | Development mock callback verification only; requires at least 32 characters |
| `GRAMVISTA_SMS_API_URL`, `GRAMVISTA_SMS_API_KEY`, `GRAMVISTA_SMS_SENDER_ID` | Gramvista API base, restricted API key and approved shared Sender ID |
| `GRAMVISTA_SMS_WEBHOOK_SECRET` | Secret shown once when registering the Mtaa Connect delivery webhook in Gramvista |
| `SMS_CREDENTIAL_ENCRYPTION_KEY` | Base64-encoded 32-byte key used to encrypt Mtaa-owned provider credentials |
| `SMS_WEBHOOK_SECRET` | Development mock delivery callback verification only |
| `WORKER_SECRET` | At least 32 random characters, required for worker requests |
| `ALLOW_MOCK_PROVIDERS` | Explicit development-only opt-in |

## 3. Create the first Super Admin

After migrating, temporarily put these values in `.env.local`:

```dotenv
BOOTSTRAP_ADMIN_EMAIL=your-admin-email
BOOTSTRAP_ADMIN_PASSWORD=your-unique-password-at-least-8-characters
BOOTSTRAP_ADMIN_NAME=Your Name
```

Then:

```powershell
npm.cmd ci
npm.cmd run check:env
npm.cmd run bootstrap:admin
npm.cmd run dev
```

Open http://localhost:3000/login. Remove the bootstrap password/settings from `.env.local` after successful creation. The database serializes bootstrap and refuses a second Super Admin through this command. No default username/password is supplied. A conflicting existing Auth email needs deliberate reconciliation; the script does not silently elevate existing accounts.

Disable public Auth signup in the hosted Supabase project: residents do not need Auth accounts. No browser signup page exists, and unprovisioned Auth users receive no resident permissions. Local signup is already disabled in `supabase/config.toml`.

## 4. Start registering residents

1. Sign in as Super Admin.
2. In **Maeneo**, select an imported Region, District and Kata/Shehia, then add your genuine Mtaa and Balozi area. The NBS 2022 census import supplies 31 regions, 150 districts and 4,344 wards/shehia across Mainland Tanzania and Zanzibar. Read [source coverage and caveats](docs/location-data.md); this census snapshot does not certify all post-2022 boundary changes.
3. Optionally create a Mtaa administrator in **Wasimamizi**, assign a Mtaa and share the temporary password securely. Administrators can change passwords under **Mipangilio**.
4. Open **Wakazi → Sajili mkazi**. Choose the location, enter name/phone, select one or two categories and record informed consent.
5. Check residence approval only after your operational verification. An unchecked record remains pending.
6. Registration is saved independently of payment. A registered person is not automatically a paid subscriber.
7. Use the resident edit page or public receipt to start ClickPesa payment. Only an authenticated provider reconciliation can activate the subscription.

A Super Admin can register people across Mitaa. A Mtaa Admin can only register/manage their assigned active Mtaa. RLS protects direct database reads, and service-only transactional functions recheck the trusted actor on every write.

### Create Chairperson/Admin and Agent accounts

Sign in as Super Admin and open **Wasimamizi**. Choose **Msimamizi / Mwenyekiti wa mtaa** or **Wakala wa usajili**, enter the person's name, email and temporary password, then assign the correct Region → District → Ward → Mtaa. The account can be reassigned or suspended from the same page. Share temporary credentials securely.

An Agent logs in through `/login` and is redirected to `/agent`. The agent can register a resident only in the assigned Mtaa, choose an optional Balozi, categories and custom groups, record consent, and enter a separate mobile-money payer number. The resident remains pending for Mtaa leadership approval. The registration creates a TSh 3,000 payment request and ClickPesa sends the USSD prompt to the payer number. Agent dashboards show their own registrations, successful payments, earned commission, paid amount and balance.

Commission is **TSh 300 per verified agent-originated TSh 3,000 registration payment**. Creating a resident or pending payment does not earn commission. The verified payment webhook creates the commission exactly once. Actual payout to an agent is not yet transferred by this application; integrate and verify a payout provider before changing an entry from `earned` to `paid`.

### Public self-registration

Share `/register` (locally: `http://localhost:3000/register`). The resident selects Region → District → Ward → Mtaa, optionally selects a Balozi area, enters name/phone, chooses one or two categories and any applicable custom grouping options, then gives consent. Mitaa, Balozi areas and custom groups must first be created by authorized administrators; public visitors cannot create them.

To create a message group, open **Vikundi**, create a field such as **Aina ya biashara**, open that field and add choices such as **Wakulima** and **Wafanyabiashara**. The choices appear on resident forms. In **Andaa SMS**, choose **Kundi maalum**, then select the field and choice. Recipient resolution remains server-side and includes only approved residents with active subscriptions in the campaign's Mtaa.

Submitting saves a pending resident and a TSh 3,000 payment request atomically, then opens `/register/payment`. The visitor needs no account. An HttpOnly, SameSite cookie grants access to that receipt on the same browser for seven days; no resident lookup by phone is exposed. The page shows payment/approval status and can be refreshed. A lost/expired cookie requires assistance from the Mtaa administrator; phone verification and self-service recovery remain future work.

With `PAYMENT_PROVIDER=clickpesa`, the payment button previews availability and sends a TSh 3,000 USSD prompt to the separately entered Tanzanian payer number. Repeated or failed attempts use durable 20-character ClickPesa order references without losing the link to the original payment. A frontend response never activates a subscription: the webhook is checked against ClickPesa's authenticated payment-status API before six calendar months are activated, and is additionally HMAC-verified when checksum signing is enabled. Mtaa Admins review pending residents through **Wakazi** and approve only after verifying residence. Approval plus verified payment queues the welcome SMS for the Gramvista worker.

In the ClickPesa dashboard, create an **API** application with **Payment API**, optionally enable canonical checksum signing and set its key, whitelist the deployed server's outbound IP if required, and configure application webhooks for `PAYMENT RECEIVED` and `PAYMENT FAILED` to `https://YOUR_DOMAIN/api/webhooks/payments`. ClickPesa does not provide a sandbox, so first verify the full flow with a small live transaction and a separate pilot account. Run `npm run check:clickpesa` for a non-charging availability preview.

See [public registration security and integration notes](docs/public-registration.md).

### Import reviewed location data

Use a UTF-8 JSON array of rows with `region`, `district`, `ward`, `mtaa`, `balozi` and optional `balozi_name`. Each row identifies one Balozi area and its complete hierarchy. Obtain these values from a verified official/operational source.

Set `IMPORT_ACTOR_ID` in `.env.local` to the existing active Super Admin profile UUID, then run:

```powershell
npm.cmd run import:locations -- C:\path\to\reviewed-locations.json
```

The importer validates the full file, reuses matching hierarchy nodes and audits newly created nodes. If interrupted, completed rows remain and rerunning reuses them. It does not import residents or overwrite existing names.

## Payment and SMS integration

See [integration contracts and worker operation](docs/integrations.md). ClickPesa and Gramvista use their documented server APIs and verified callback boundaries.

The payment callback boundary can activate a subscription only after the adapter verifies a provider event. The database enforces TSh 3,000/TZS, idempotency and six-calendar-month periods. Renewal extends from the current expiry when still active. Approval plus an active subscription queues exactly one welcome campaign per resident.

Campaign drafts resolve recipients on the server. Explicit confirmation freezes the preview set for queuing; newly eligible residents are not added. Eligibility is checked again when claiming work. Uncertain sends are never automatically resent. Estimated SMS units account for GSM extension characters and Unicode in administrator campaigns; costs await official tariffs.

A protected scheduler must process `POST /api/internal/worker` periodically to expire subscriptions and process batches. Eligibility also checks timestamps directly, so overdue maintenance never makes expired subscriptions eligible. Production uses a Cloudflare Cron Trigger every five minutes; manual calls still require `Authorization: Bearer <WORKER_SECRET>`.

## Checks and commands

```powershell
npm.cmd run dev
npm.cmd run check          # ESLint, TypeScript and tests
npm.cmd test               # Includes real PostgreSQL/RLS function execution in PGlite
npm.cmd run build
npm.cmd start
npm.cmd run check:env
npm.cmd run check:clickpesa -- 0712345678
npm.cmd run check:gramvista
npm.cmd run bootstrap:admin
npm.cmd run import:locations -- path-to-reviewed-file.json
```

On macOS/Linux, use `npm` / `npx` without `.cmd`. Vitest uses one thread worker at a time and baseline-only WebAssembly compilation to keep PostgreSQL test memory manageable on Windows. These flags affect tests only. Tests cover tenant isolation, authorization, consent, duplicate registration, category limits, payment amount/idempotency/renewal, calendar month ends, welcome deduplication, targeting (including custom groups), explicit confirmation, expired exclusion, SMS claims/delivery and callback signatures.

## Deployment

- Push the `main` branch to a private GitHub repository; GitHub Actions runs checks and the production build on every push and pull request.
- The production app is deployed as the Cloudflare Worker `mtaa-connect` with `npm run build:vinext`, followed by `wrangler deploy --config dist/server/wrangler.json`.
- Configure production secrets with `wrangler secret put`; do not commit `.env.local` or provider credentials.
- Production app URL: `https://mtaa.gramvistaempiregroup.com`.
- The Worker route `mtaa.gramvistaempiregroup.com/*` uses the existing proxied Cloudflare DNS record.
- Configure Supabase Auth site URL and exact approved redirect URLs for the deployment.
- Register the ClickPesa callback at `/api/webhooks/payments` and Gramvista callback at `/api/webhooks/sms` on the production domain.
- Cloudflare invokes the authenticated queue worker every five minutes through the Worker `scheduled` handler. Keep `WORKER_SECRET` configured as a Worker secret.
- Configure the first Super Admin, genuine locations and a staging pilot before collecting resident data.
- Run real Supabase sessions for two tenants, a suspended user and Super Admin before pilot release. Verify backup/restore, provider behavior, operational consent policy and retention requirements with the people responsible for the service.

Generated Supabase client schema types can be refreshed with `supabase gen types typescript --linked`; `src/types/domain.ts` currently defines application query result shapes.

See [security policy documentation](docs/security.md). Implementation references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [server-side Auth clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

## Verification of this implementation

- ESLint and TypeScript checks passed.
- All 64 tests passed, including execution of all sixteen migrations, agent and tenant isolation, separate agent payer phones, ClickPesa initiation/reconciliation, per-Mtaa SMS credential isolation, Gramvista account/Sender ID verification, sending/signatures, targeting and administrative scope checks in PostgreSQL/PGlite.
- Production build passed.
- Production HTTP checks passed for the landing page, login configuration help, protected-route redirects and rejection of unconfigured webhook/worker requests.
- Production is deployed to Cloudflare Workers at `https://mtaa.gramvistaempiregroup.com`, with a five-minute Cron Trigger and production Auth redirects configured.
- Gramvista authentication succeeds, `TAARIFA` is approved, and the configured wallet is reachable. ClickPesa credentials remain live-provider dependencies; complete a small successful transaction and configure its dashboard callback before treating automated settlement as accepted end-to-end.
