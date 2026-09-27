import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createAdminClient } from '../../lib/supabase/admin';
import { PaymentInitiationError, type PaymentProvider, type PaymentRequest, type VerifiedPayment } from './types';
import { parseClickPesaConfig, type ClickPesaConfig } from './clickpesa-config';
type AttemptStatus = 'processing' | 'failed' | 'successful';
type Fetcher = typeof fetch;

type AttemptStore = {
  prepare(paymentId: string): Promise<string>;
  latest?(paymentId:string):Promise<string|null>;
  findPayment(orderReference: string): Promise<string>;
  record(paymentId: string, orderReference: string, transactionId: string | null, status: AttemptStatus): Promise<void>;
};

type TokenEntry = { value: string; expiresAt: number };
type TokenCache = Map<string, TokenEntry>;
const sharedTokenCache: TokenCache = new Map();

const amountSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/).transform(Number),
]);

const transactionSchema = z.object({
  id: z.string().min(1).max(200),
  status: z.enum(['SUCCESS', 'SETTLED', 'PROCESSING', 'PENDING', 'FAILED']),
  paymentReference: z.string().min(1).max(200).optional(),
  orderReference: z.string().regex(/^[A-Za-z0-9]{1,20}$/),
  collectedAmount: amountSchema.optional(),
  collectedCurrency: z.string().optional(),
  clientId: z.string().optional(),
  message: z.string().optional(),
}).passthrough();

const webhookSchema = z.object({
  event: z.enum(['PAYMENT RECEIVED', 'PAYMENT FAILED']),
  data: z.object({
    id: z.string().min(1).max(200),
    status: z.string(),
    orderReference: z.string().regex(/^[A-Za-z0-9]{1,20}$/),
  }).passthrough(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  checksumMethod: z.literal('canonical').optional(),
}).passthrough();

const previewSchema = z.object({
  activeMethods: z.array(z.object({ name: z.string(), status: z.enum(['AVAILABLE', 'UNAVAILABLE']) }).passthrough()).min(1),
  sender: z.object({ accountProvider: z.string() }).passthrough().optional(),
}).passthrough();

const initiateSchema = z.object({
  id: z.string().min(1).max(200),
  status: z.enum(['PROCESSING', 'SUCCESS', 'FAILED', 'SETTLED']),
  orderReference: z.string().regex(/^[A-Za-z0-9]{1,20}$/),
}).passthrough();

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = canonicalize((value as Record<string, unknown>)[key]);
      return result;
    }, {});
}

export function createClickPesaChecksum(key: string, payload: Record<string, unknown>) {
  return createHmac('sha256', key).update(JSON.stringify(canonicalize(payload))).digest('hex');
}

export function verifyClickPesaChecksum(key: string, payload: Record<string, unknown>) {
  const received = payload.checksum;
  if (typeof received !== 'string' || !/^[a-f0-9]{64}$/i.test(received)) throw new Error('Invalid ClickPesa checksum');
  if (payload.checksumMethod !== undefined && payload.checksumMethod !== 'canonical') throw new Error('Unsupported ClickPesa checksum method');
  const unsigned = { ...payload };
  delete unsigned.checksum;
  delete unsigned.checksumMethod;
  const expected = Buffer.from(createClickPesaChecksum(key, unsigned), 'hex');
  const actual = Buffer.from(received, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid ClickPesa checksum');
}

function defaultAttemptStore(): AttemptStore {
  return {
    async prepare(paymentId) {
      const { data, error } = await createAdminClient().rpc('prepare_payment_attempt', {
        p_payment: paymentId,
        p_provider: 'clickpesa',
      });
      if (error) throw new Error('Unable to prepare ClickPesa payment');
      return z.string().regex(/^[A-Za-z0-9]{1,20}$/).parse(data);
    },
    async latest(paymentId){
      const {data,error}=await createAdminClient().rpc('latest_payment_attempt',{p_payment:paymentId,p_provider:'clickpesa'});
      if(error)throw new Error('Unable to find latest ClickPesa attempt');
      return z.string().regex(/^[A-Za-z0-9]{1,20}$/).nullable().parse(data);
    },
    async findPayment(orderReference) {
      const { data, error } = await createAdminClient().rpc('payment_for_order_reference', {
        p_provider: 'clickpesa',
        p_order_reference: orderReference,
      });
      if (error) throw new Error('Unable to find ClickPesa payment');
      return z.uuid().parse(data);
    },
    async record(paymentId, orderReference, transactionId, status) {
      const { error } = await createAdminClient().rpc('record_payment_attempt', {
        p_payment: paymentId,
        p_provider: 'clickpesa',
        p_order_reference: orderReference,
        p_transaction_id: transactionId,
        p_status: status,
      });
      if (error) throw new Error('Unable to record ClickPesa payment');
    },
  };
}

function withChecksum(config: ClickPesaConfig, payload: Record<string, unknown>) {
  return config.CLICKPESA_CHECKSUM_KEY
    ? { ...payload, checksum: createClickPesaChecksum(config.CLICKPESA_CHECKSUM_KEY, payload) }
    : payload;
}

async function responseJson(response: Response) {
  const text = await response.text();
  if (text.length > 65_536) throw new Error('ClickPesa response is too large');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Invalid ClickPesa response');
  }
}

async function throwInitiationError(response: Response): Promise<never> {
  const result = z.object({ message: z.string() }).safeParse(await responseJson(response));
  const message = result.success ? result.data.message : '';
  if (/payment method is not active/i.test(message)) throw new PaymentInitiationError('method_unavailable');
  if (/invalid\s*\/\s*unsupported phone number/i.test(message)) throw new PaymentInitiationError('invalid_phone');
  throw new Error('ClickPesa payment initiation failed');
}

function authorizationHeader(token: string) {
  return /^Bearer\s/i.test(token) ? token : `Bearer ${token}`;
}

function paymentMethodKey(value:string){
  const normalized=value.toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(normalized.includes('AIRTEL'))return 'AIRTEL';
  if(normalized.includes('TIGO'))return 'TIGO';
  if(normalized.includes('HALO'))return 'HALO';
  if(normalized.includes('MPESA')||normalized.includes('VODACOM'))return 'MPESA';
  return normalized;
}

export function clickPesaProvider(options: {
  env?: Record<string, unknown>;
  fetcher?: Fetcher;
  store?: AttemptStore;
  tokenCache?: TokenCache;
  now?: () => number;
} = {}): PaymentProvider {
  const config = parseClickPesaConfig(options.env ?? process.env);
  const fetcher = options.fetcher ?? fetch;
  const store = options.store ?? defaultAttemptStore();
  const tokenCache = options.tokenCache ?? sharedTokenCache;
  const now = options.now ?? Date.now;
  const apiKeyFingerprint = createHash('sha256').update(config.CLICKPESA_API_KEY).digest('hex');
  const cacheKey = `${config.CLICKPESA_API_BASE_URL}|${config.CLICKPESA_CLIENT_ID}|${apiKeyFingerprint}`;

  async function generateToken(force = false) {
    const cached = tokenCache.get(cacheKey);
    if (!force && cached && cached.expiresAt > now()) return cached.value;
    const response = await fetcher(`${config.CLICKPESA_API_BASE_URL}/generate-token`, {
      method: 'POST',
      headers: { 'client-id': config.CLICKPESA_CLIENT_ID, 'api-key': config.CLICKPESA_API_KEY },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error('ClickPesa authentication failed');
    const body = z.object({ success: z.literal(true), token: z.string().min(1) }).parse(await responseJson(response));
    const token = authorizationHeader(body.token);
    tokenCache.set(cacheKey, { value: token, expiresAt: now() + 55 * 60_000 });
    return token;
  }

  async function api(path: string, init: RequestInit = {}, retry = true) {
    const token = await generateToken();
    const response = await fetcher(`${config.CLICKPESA_API_BASE_URL}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init.headers, authorization: token },
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    });
    if (response.status === 401 && retry) {
      tokenCache.delete(cacheKey);
      await generateToken(true);
      return api(path, init, false);
    }
    return response;
  }

  async function query(orderReference: string) {
    const response = await api(`/payments/${encodeURIComponent(orderReference)}`);
    if (response.status === 404) return null;
    if (response.status === 400) {
      const error = z.object({ message: z.string() }).safeParse(await responseJson(response));
      if (error.success && /^Invalid or missing payment:/i.test(error.data.message)) return null;
      throw new Error('ClickPesa payment lookup failed');
    }
    if (!response.ok) throw new Error('ClickPesa payment lookup failed');
    const transactions = z.array(transactionSchema).parse(await responseJson(response));
    return transactions.find((item) => item.orderReference === orderReference) ?? null;
  }

  async function sendPush(request: PaymentRequest, orderReference: string) {
    const phoneNumber = request.phone.replace(/^\+/, '');
    if (!/^255[67]\d{8}$/.test(phoneNumber)) throw new Error('Unsupported ClickPesa phone number');
    const payload = { amount: String(request.amount), currency: request.currency, orderReference, phoneNumber };
    const previewPayload = { ...payload, fetchSenderDetails: true };
    const preview = await api('/payments/preview-ussd-push-request', {
      method: 'POST',
      body: JSON.stringify(withChecksum(config, previewPayload)),
    });
    if (!preview.ok) throw new Error('ClickPesa payment preview failed');
    const previewBody = previewSchema.parse(await responseJson(preview));
    if (!previewBody.activeMethods.some((method) => method.status === 'AVAILABLE')) throw new Error('No ClickPesa payment method is available');
    if (previewBody.sender && !previewBody.activeMethods.some((method) => paymentMethodKey(method.name) === paymentMethodKey(previewBody.sender!.accountProvider) && method.status === 'AVAILABLE')) {
      throw new PaymentInitiationError('method_unavailable');
    }

    const initiated = await api('/payments/initiate-ussd-push-request', {
      method: 'POST',
      body: JSON.stringify(withChecksum(config, payload)),
    });
    if (!initiated.ok) await throwInitiationError(initiated);
    const result = initiateSchema.parse(await responseJson(initiated));
    if (result.orderReference !== orderReference) throw new Error('ClickPesa returned a mismatched order reference');
    const status: AttemptStatus = result.status === 'FAILED'
      ? 'failed'
      : result.status === 'SUCCESS' || result.status === 'SETTLED'
        ? 'successful'
        : 'processing';
    await store.record(request.id, orderReference, result.id, status);
    if (status === 'failed') throw new Error('ClickPesa rejected the payment request');
    return { reference: result.id, status: 'pending' as const };
  }

  async function verifiedPayment(paymentId:string,transaction:z.infer<typeof transactionSchema>){
    if(
      !['SUCCESS','SETTLED'].includes(transaction.status)||
      transaction.collectedAmount!==3000||
      transaction.collectedCurrency!=='TZS'||
      !transaction.paymentReference||
      (transaction.clientId&&transaction.clientId!==config.CLICKPESA_CLIENT_ID)
    )throw new Error('ClickPesa payment is not verified');
    await store.record(paymentId,transaction.orderReference,transaction.id,'successful');
    return {eventId:`cp:${createHash('sha256').update(transaction.id).digest('hex')}`,paymentId,providerReference:transaction.paymentReference,amount:3000 as const,currency:'TZS' as const};
  }

  return {
    name: 'clickpesa',
    async initiate(request) {
      let orderReference = await store.prepare(request.id);
      const existing = await query(orderReference);
      if (existing) {
        const status: AttemptStatus = existing.status === 'FAILED'
          ? 'failed'
          : existing.status === 'SUCCESS' || existing.status === 'SETTLED'
            ? 'successful'
            : 'processing';
        await store.record(request.id, orderReference, existing.id, status);
        if (status !== 'failed') return { reference: existing.id, status: 'pending' };
        orderReference = await store.prepare(request.id);
      }
      return sendPush(request, orderReference);
    },
    async verifyWebhook(rawBody): Promise<VerifiedPayment | null> {
      const parsedJson = z.record(z.string(), z.unknown()).parse(JSON.parse(rawBody));
      if (config.CLICKPESA_CHECKSUM_KEY) verifyClickPesaChecksum(config.CLICKPESA_CHECKSUM_KEY, parsedJson);
      const webhook = webhookSchema.parse(parsedJson);
      const paymentId = await store.findPayment(webhook.data.orderReference);

      if (webhook.event === 'PAYMENT FAILED') {
        await store.record(paymentId, webhook.data.orderReference, webhook.data.id, 'failed');
        return null;
      }

      const transaction = await query(webhook.data.orderReference);
      if(!transaction||transaction.id!==webhook.data.id)throw new Error('ClickPesa payment is not verified');
      return verifiedPayment(paymentId,transaction);
    },
    async reconcile(paymentId){
      if(!store.latest)throw new Error('ClickPesa reconciliation is unavailable');
      const orderReference=await store.latest(paymentId);
      if(!orderReference)return {status:'pending'};
      const transaction=await query(orderReference);
      if(!transaction)return {status:'pending'};
      if(transaction.status==='FAILED'){
        await store.record(paymentId,orderReference,transaction.id,'failed');
        return {status:'failed',reason:/insufficient funds/i.test(transaction.message||'')?'insufficient_funds':'rejected'};
      }
      if(!['SUCCESS','SETTLED'].includes(transaction.status)){
        await store.record(paymentId,orderReference,transaction.id,'processing');
        return {status:'pending'};
      }
      return {status:'successful',payment:await verifiedPayment(paymentId,transaction)};
    },
  };
}
