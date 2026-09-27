# Public resident registration

`/register` is available without Supabase Auth. It collects the minimum fields required for resident communication and informed consent. `/register/payment` displays the receipt for the current browser, never a record supplied by URL ID or phone number.

## Trust boundaries

- `/api/public/locations` returns only IDs and names from an explicit allowlist of geography, category and grouping tables. Inactive Mitaa/Balozi/categories/groups are excluded. Balozi, category and grouping-field requests require an active parent Mtaa; grouping choices are checked against that Mtaa scope. It never returns resident names, phone numbers, Balozi leader names, payments, profiles or audit logs. Ordinary browser RLS grants are unchanged.
- The server action uses a strict Zod allowlist and normalizes Tanzanian phone numbers. Client-supplied resident IDs, approval, amount, payment status or extra fields are rejected. Next.js Server Actions provide origin checks; do not loosen allowed origins for production.
- Shared PostgreSQL rate limits allow five submissions per normalized phone per hour and 300 total per hour for the pilot. These are ceilings, not goals; legitimate retries also consume attempts. Limits fail closed on database errors. A hidden honeypot rejects basic bots. Add Vercel edge rate limiting/CAPTCHA when deploying publicly at scale. No untrusted forwarded IP header is used as an identity.
- `register_public_resident` is service-role-only. It atomically creates a pending resident, one or two category links, optional custom grouping choices, a pending TSh 3,000/TZS payment, a private receipt and an audit entry. Mtaa is required; Balozi is optional and checked against the Mtaa when supplied. Existing tenant/category/group triggers remain enforced, while names and phone numbers may be shared. It creates no Auth user and never approves residents or settles payments.
- A cryptographically random 256-bit receipt capability is stored in an HttpOnly, SameSite=Lax cookie scoped to `/register`, Secure in production, with a seven-day expiry. Only SHA-256 is stored in `private.registration_sessions`, protected by RLS, revoked browser grants and service-only RPCs. Receipt data is rendered dynamically and not publicly cached. Never put receipt tokens in logs or URLs.
- A request fingerprint and transaction lock make retries with the same cookie/payload return the same payment. Changed payloads rotate to a new private browser receipt and never overwrite or expose an existing resident/payment.
- One browser receipt covers one self-registration. Recovery, registering another household member from the same browser, and verified phone ownership need a separate verified flow; administrators can assist. Payment/approval status alone is shown on the receipt, without exposing phone, resident ID, provider reference or full name.

## Payment and activation

The receipt shows TSh 3,000 for six months. With `PAYMENT_PROVIDER=pending` it clearly states that payments are not connected. With `PAYMENT_PROVIDER=clickpesa`, the server previews and initiates a ClickPesa USSD Push for the normalized Tanzanian mobile number. The development-only mock cannot collect money and must never be enabled in production.

`startPublicPayment` resolves the receipt using the secret cookie and sends only server-derived amount, currency, phone, resident ID and stable idempotency key to the provider. It does not settle payments. The ClickPesa adapter stores every 20-character order reference in `private.payment_attempts`, reuses in-flight attempts, and allocates a new reference only after a verified failure. Only a canonical HMAC-verified webhook followed by an authenticated successful ClickPesa status lookup can call `settle_payment`.

The payment page accepts a separately validated Tanzanian payer phone. It defaults to the resident contact for convenience, but the payer can replace it before requesting USSD. Migration `202609260004_payment_payer_phone.sql` records that destination on the payment without changing the resident contact.

The **Angalia hali tena** action polls ClickPesa's authenticated payment query and applies the same amount, currency, transaction and client checks used by the webhook before settlement. Migration `202609260005_clickpesa_payment_reconciliation.sql` exposes only the latest mapped attempt to the trusted service role. This permits safe local development verification when ClickPesa cannot call a localhost webhook.

Migration `202609260001_clickpesa_ussd.sql` adds ClickPesa to the provider allowlists and adds service-only attempt RPCs. After the operator explicitly enabled ClickPesa, migration `202609260002_activate_clickpesa_pending.sql` converted only untouched placeholder requests: provider `pending`, payment status `pending`, and no provider reference, subscription or paid timestamp. ClickPesa credentials and checksum keys remain server-only.

Migration `202609260003_allow_shared_resident_identity.sql` treats phone numbers as contact/payment destinations rather than resident identifiers. Names and phone numbers may be shared; each registration and payment keeps its own immutable resident/payment IDs. A changed registration in the same browser rotates the private receipt session, while an unchanged retry remains idempotent.

Mtaa approval is required independently of payment. Eligibility requires an active resident, approved registration, active Mtaa, a valid active Balozi when one is assigned, and an unexpired paid subscription. A resident without Balozi remains eligible for Mtaa and group campaigns but is excluded from Balozi-targeted campaigns. A welcome SMS is queued once when payment and approval are both complete. Gramvista delivery requires configured credentials, an approved Sender ID, SMS balance and the authenticated queue worker.

## Operations and verification

Migration `202609250008_public_registration.sql` adds the private receipt boundary; migration `202609260001_clickpesa_ussd.sql` adds private provider-attempt mapping and service-only RPCs. Neither weakens browser RLS or changes existing resident records. Periodically delete expired rows from `private.registration_sessions` and old rate-limit entries through trusted maintenance; never delete payment/resident history merely because the browser capability expires.

Tests execute the migrations in PostgreSQL/PGlite and exercise ClickPesa request signing, USSD initiation, retry mapping, webhook verification and authenticated status reconciliation with mocked network responses. A small live ClickPesa transaction and mobile-browser acceptance test are still required before launch because ClickPesa has no sandbox.
