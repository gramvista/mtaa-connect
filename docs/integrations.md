# Payment and SMS integration contracts

## Current behavior

`PAYMENT_PROVIDER=clickpesa` enables real ClickPesa USSD-PUSH collection. `PAYMENT_PROVIDER=pending` records requests without collecting funds. `SMS_PROVIDER=gramvista` enables the production Gramvista adapter; `disabled` leaves confirmed campaigns in the durable queue.

- Payment contract: `src/services/payments/types.ts`.
- SMS contract: `src/services/sms/types.ts`.
- Trusted callback routes: `/api/webhooks/payments` and `/api/webhooks/sms`.
- Worker: `POST /api/internal/worker`, authenticated with `Authorization: Bearer <WORKER_SECRET>`.

This `WORKER_SECRET` belongs only to Mtaa Connect and protects Mtaa's queue endpoint. It is not Gramvista's internal worker secret. Never store Gramvista worker credentials, Kilakona credentials, or Gramvista's Supabase service-role key in Mtaa Connect.

The worker expires subscriptions and claims at most 25 eligible queued recipients. Concurrent calls are safe because claims use `SKIP LOCKED`. A provider timeout may have sent a real message, so ambiguous results become `uncertain` and are never retried automatically. Reconcile those records against Gramvista before any manual resend.

## ClickPesa USSD-PUSH collection

The adapter exchanges the server-only client ID and API key for a short-lived bearer token, previews channel availability, and initiates a TSh 3,000/TZS prompt on the payer number supplied for that payment. The payer number may differ from the resident phone. The API origin is locked to ClickPesa's official HTTPS endpoint.

ClickPesa order references are limited to 20 alphanumeric characters. `private.payment_attempts` maps retries to the original payment, reuses in-flight attempts, and retains failed attempts so delayed callbacks remain resolvable. Browser roles cannot execute these RPCs.

Configure `PAYMENT RECEIVED` and `PAYMENT FAILED` callbacks at `https://YOUR_DOMAIN/api/webhooks/payments`. If canonical checksum signing is enabled in ClickPesa, set `CLICKPESA_CHECKSUM_KEY`. A success callback never settles on trust alone: the server maps it to a known attempt, queries ClickPesa with authenticated credentials, and verifies the amount, currency, transaction ID and client before calling `settle_payment`.

ClickPesa has no sandbox. `npm run check:clickpesa -- 0712345678` performs a non-charging availability preview. Complete the final acceptance check with a small real transaction and a test resident.

## Gramvista SMS

The customer workspace is live at `https://sms.gramvistaempiregroup.com`, but it is a website and is never used as an API origin. The production adapter exclusively uses `https://sscleaiwktklkuxqqndf.supabase.co/functions/v1/public-api/v1`. It authenticates with a `gvs_live_...` or `gvs_test_...` bearer key, sends each recipient with a stable idempotency key, treats the exact `201`/`queued` response as asynchronous acceptance rather than delivery, resolves the returned campaign to the permanent `gvs_msg_...` message reference, and verifies signed delivery webhooks over the exact raw request body.

For the shared platform setup:

1. Sign up at `https://sms.gramvistaempiregroup.com` and create a Mtaa Connect organization.
2. Request one Sender ID of at most 11 letters, numbers or spaces, such as `MTAACONNECT`, and wait for approval.
3. Create a restricted API key with `messages.send`, `messages.read`, `wallet.read` and `sender_ids.read` permissions.
4. Register `https://YOUR_DOMAIN/api/webhooks/sms` for message delivery/failure events and copy the webhook secret when shown.
5. Add the Gramvista variables from `.env.example`, generate `SMS_CREDENTIAL_ENCRYPTION_KEY`, and run `npm run check:gramvista`.
6. Set `SMS_PROVIDER=gramvista` only after the readiness check succeeds and the wallet contains SMS credits.

When a Mtaa administrator saves an own-account key, Mtaa Connect calls Gramvista's `/balance` and `/sender-ids` endpoints before storing it. The save succeeds only when authentication works, the key has the required read permissions, and the selected Sender ID belongs to that organization and is approved.

The adapter accepts only Gramvista's documented production/custom API host and the pinned hosted Supabase API path, preventing a changed environment value from forwarding credentials to an arbitrary server. API responses and webhook bodies are bounded. Phone numbers, message bodies and credentials are not written to application logs.

### Per-Mtaa SMS accounts

Migration `202609260006_mtaa_sms_settings.sql` lets each Mtaa administrator choose:

- **Platform**: use Mtaa Connect's shared Gramvista wallet and shared Sender ID.
- **Own account**: supply that Mtaa's own Gramvista API key, approved Sender ID and webhook secret under **Mipangilio**.

Mtaa-owned secrets are encrypted with AES-256-GCM using `SMS_CREDENTIAL_ENCRYPTION_KEY`, bound to the Mtaa ID, and stored in the private schema. Browser roles cannot read the ciphertext or execute the credential RPCs. Leaving a secret field blank preserves the existing value.

Each Mtaa buys credits and requests Sender IDs in its own Gramvista customer account. Gramvista deliberately rejects API-key calls to its ClickPesa checkout because purchasing requires an authenticated customer session, so Mtaa Connect does not impersonate a customer or store their Gramvista login. A future hosted Gramvista customer portal can be linked from Mtaa Connect once its public URL is deployed.

“Any bulk SMS provider” cannot be safely enabled by accepting an arbitrary URL and key: that would create credential-leak and request-forgery risks, and providers use different authentication, delivery states and signatures. The database/provider boundary supports adding reviewed adapters later; the only production adapter currently enabled is Gramvista.

## Scheduler

Cloudflare invokes `POST /api/internal/worker` every five minutes through the Worker's `scheduled` handler. The handler sends `Authorization: Bearer <WORKER_SECRET>` and never places the secret in a URL. Keep the Cron Trigger and Worker secret configured together when creating another environment.

## Development-only mocks

Use a separate development Supabase project with test residents only. Production rejects mocks.

```dotenv
ALLOW_MOCK_PROVIDERS=true
PAYMENT_PROVIDER=mock
SMS_PROVIDER=mock
PAYMENT_WEBHOOK_SECRET=at-least-32-random-characters
SMS_WEBHOOK_SECRET=another-at-least-32-random-characters
WORKER_SECRET=another-long-random-secret
```

Mock callbacks use `x-mtaa-timestamp` and `x-mtaa-signature`, where the signature is hex HMAC-SHA256 over `timestamp + '.' + exactRawBody`. This is an internal test contract, not a Gramvista or ClickPesa format.

## Before production activation

Test duplicate callbacks, provider acceptance followed by timeout, invalid signatures, insufficient ClickPesa funds, insufficient SMS balance, an unapproved Sender ID, subscription expiry, changed recipient eligibility, GSM/Unicode segmentation and unknown delivery states. Keep the shared platform and each Mtaa wallet funded. Live end-to-end SMS delivery cannot be claimed until an approved Sender ID, funded Gramvista wallet and production API key are available.
