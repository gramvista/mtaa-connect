# Security and tenant isolation

## Trust boundaries

Every administrator page, lookup route and server action calls `requireAdmin()`. Agent pages call `requireAgent()`. Both verify the Auth user via `getUser()`, read the current profile and check role/status plus an active assigned Mtaa. Browser roles and submitted actor IDs are never trusted: actions derive the actor from the verified user.

Mtaa reads use the user's cookie-scoped Supabase client and RLS. Super Admin cross-tenant reads use the server-only service client after the same live authentication check. No authenticated-browser policy grants Super Admin unrestricted resident access. All writes use narrow service-only database functions that recheck the actor's profile, tenant and status inside the transaction. The service key is never returned to browser code.

The proxy refreshes cookies and sets private/no-store response headers. It is not authorization. Missing configuration redirects protected requests to the login setup page; no data is exposed. Administrator pages render dynamically and do not share a data cache.

## RLS and grants

All public product tables have RLS enabled. Anonymous users have no table grants or application-function execution. Authenticated users have SELECT only, subject to these policies:

| Table | SELECT policy |
| --- | --- |
| profiles | Own Auth-linked row only (even when suspended, allowing denial by the application) |
| regions, districts, wards | Any active provisioned administrator; contains no resident data |
| location_datasets | Active administrators can read provenance; no browser writes |
| mitaa | Assigned Mtaa, with active profile and active Mtaa |
| balozi_areas, residents | Assigned active Mtaa only |
| categories | Global categories for active administrators; local categories only in assigned Mtaa |
| resident_categories | Access through the resident's Mtaa |
| subscriptions, payments | Direct mtaa_id tenant policy; composite foreign keys prevent mismatched resident/tenant |
| sms_campaigns, sms_recipients | Direct mtaa_id tenant policy; composite foreign keys bind campaign and resident to same tenant |
| sms_templates | Active administrators can read templates |
| audit_logs | Assigned active Mtaa only; no tenant writes/deletes |
| agent_commissions | Agent can read only their own ledger; Mtaa Admin can read commissions for their tenant; no browser writes |

`resident_directory` is a `security_invoker` view, so underlying table RLS remains effective. It computes subscription status from dates without relying on scheduled expiration alone. Geography/cascading endpoints are authenticated and return bounded lists, while resident lists use exact counts and pages of 25. Name/phone substring search has trigram indexes.

Functions used by RLS live in the non-exposed `private` schema and have an empty search path. All relations are schema-qualified. Trigger/business functions are revoked from PUBLIC/anon/authenticated except the two explicitly granted policy helpers. Every public administrative/payment/queue RPC is EXECUTE-granted only to service_role.

## Integrity and administrative operations

- No Auth signup trigger copies browser-supplied metadata into roles.
- Profile creation is explicit. First-admin bootstrap is service-only and protected by an advisory transaction lock; it refuses a second Super Admin.
- Browser users cannot update profiles, payment status, subscriptions or audit records directly.
- A resident's Balozi and Mtaa must match by composite foreign key.
- Phone is canonical +255 with supported mobile prefixes, unique within a Mtaa. Cross-Mtaa registration is possible by design, subject to local verification.
- Resident categories are edited transactionally. A trigger locks the resident before inserting categories, checks category scope/status and rejects a third category.
- Registration requires consent and one/two categories through the public server-only save operation. Approval is independent from payment and remains an operational responsibility.
- Administrators can suspend residents and local accounts; tenant reassignment and account suspension require Super Admin. Super Admin profiles cannot be edited through Mtaa account management.
- Only Super Admin creates, changes or suspends Mtaa Admin/Chairperson and Agent profiles. An agent is assigned to one Mtaa and is denied every existing administrator RPC. The dedicated agent registration RPC rechecks the active agent/Mtaa assignment, always creates a pending resident and never accepts approval or commission values.
- Important writes produce audit records in the same transaction. No names, phone numbers or provider raw payloads are copied into audit metadata. Login events are also recorded.

## Payments and messaging

Payment activation is service-only and only reached from a verified adapter callback. A callback locks the payment; a separate per-resident lock serializes renewals. Provider references and event IDs are unique. Replay returns the existing subscription. Invalid amount/currency or conflicting references are rejected. Six-month expiration uses calendar arithmetic in Africa/Dar_es_Salaam.

Agent commission is derived inside the same verified-payment transaction. An agent-originated TSh 3,000 payment inserts one TSh 300 ledger row, uniquely constrained by payment ID. Pending/failed payments create no commission and callback replay cannot duplicate it. The browser cannot mark commission paid. A future payout adapter must verify the external payout before changing ledger status.

Campaign previews use only approved, active residents with a currently active paid subscription, in an active Mtaa/Balozi. Target IDs are scope-checked. Preview alone never queues a campaign. Confirmation is single-use; queue claiming rechecks eligibility. Recipient phone snapshots preserve history.

Queue claims use row locks and SKIP LOCKED. Claims are persisted before provider sending. Automatic retries of ambiguous sends are deliberately disabled; stale claims become uncertain. If a process dies after sending, operations must reconcile provider records before any retry. Exactly-once external delivery cannot be promised without the production provider's documented idempotency guarantees.

Mocks require explicit opt-in and are rejected when NODE_ENV is production. Mock events use HMAC signatures and a five-minute timestamp tolerance, followed by database idempotency. The production Gramvista adapter verifies its `X-Gramvista-Signature` over the exact raw body, maps only a known `gvs_msg_...` reference to a Mtaa before selecting that tenant's webhook key, and accepts timestamps within five minutes.

Platform SMS credentials remain server-only. A Mtaa-owned Gramvista API key and webhook secret are AES-256-GCM encrypted with separate Mtaa-bound associated data and stored in the private schema. Browser roles can read the non-secret mode/status only. The encryption key must be a random 32-byte base64 value in the deployment secret store and must be backed up securely; losing it makes tenant credentials unreadable.

## Operational requirements and limitations

- Disable public Auth signup on hosted Supabase; local config already does so. Unknown Auth users have no profile and no resident access regardless.
- Login attempts are limited per hashed email in PostgreSQL in addition to Supabase Auth's own protections. Configure platform-level abuse controls for the deployment. Rate-limit records need periodic retention cleanup as usage grows.
- Missing server keys/migrations fail closed. Keep keys in local or hosting secrets and rotate on exposure.
- Public self-registration is available through the narrow server boundary documented in `docs/public-registration.md`; no public resident-search endpoint exists.
- The intended hosted project is linked locally, but the currently authenticated CLI account does not have access to it. Migration `202609260006_mtaa_sms_settings.sql` must not be deployed until an authorized Supabase account is used. No other project may be substituted.
- Authenticated tenant sessions, deployment and real provider end-to-end checks remain necessary in addition to PostgreSQL/PGlite tests.
