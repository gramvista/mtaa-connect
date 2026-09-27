import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import {
  clickPesaProvider,
  createClickPesaChecksum,
  verifyClickPesaChecksum,
} from './clickpesa';
import { parseClickPesaConfig } from './clickpesa-config';

const env = {
  CLICKPESA_API_BASE_URL: 'https://api.clickpesa.com/third-parties',
  CLICKPESA_CLIENT_ID: 'test-client',
  CLICKPESA_API_KEY: 'test-api-key',
  CLICKPESA_CHECKSUM_KEY: 'test-checksum-key',
};
const paymentId = '10000000-0000-4000-8000-000000000001';
const orderReference = 'MC1234567890ABCDEF01';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('ClickPesa payment provider', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('accepts only the official API endpoint and does not leak credential values', () => {
    expect(parseClickPesaConfig(env).CLICKPESA_API_BASE_URL).toBe(env.CLICKPESA_API_BASE_URL);
    const malicious = 'https://attacker.example/third-parties';
    expect(() => parseClickPesaConfig({ ...env, CLICKPESA_API_BASE_URL: malicious })).toThrow('CLICKPESA_API_BASE_URL');
    try {
      parseClickPesaConfig({ ...env, CLICKPESA_API_KEY: '' });
      expect.fail('Expected missing key to fail');
    } catch (error) {
      expect((error as Error).message).toContain('CLICKPESA_API_KEY');
      expect((error as Error).message).not.toContain(env.CLICKPESA_API_KEY);
    }
    expect(parseClickPesaConfig({ ...env, CLICKPESA_CHECKSUM_KEY: '' }).CLICKPESA_CHECKSUM_KEY).toBeUndefined();
  });

  it('omits checksums when they are disabled in the ClickPesa application', async () => {
    const bodies: Record<string,unknown>[]=[];
    const fetcher=vi.fn(async(input:URL|RequestInfo,init?:RequestInit)=>{
      const url=String(input);
      if(url.endsWith('/generate-token'))return json({success:true,token:'token-value'});
      if(url.endsWith(`/payments/${orderReference}`))return json({message:`Invalid or missing payment: ${orderReference}`},400);
      if(init?.body)bodies.push(JSON.parse(String(init.body)) as Record<string,unknown>);
      if(url.endsWith('/preview-ussd-push-request'))return json({activeMethods:[{name:'AIRTEL-MONEY',status:'AVAILABLE'}],sender:{accountProvider:'AIRTEL-MONEY'}});
      if(url.endsWith('/initiate-ussd-push-request'))return json({id:'CP-TX-3',status:'PROCESSING',orderReference});
      return json({},500);
    }) as unknown as typeof fetch;
    const provider=clickPesaProvider({env:{...env,CLICKPESA_CHECKSUM_KEY:''},fetcher,tokenCache:new Map(),store:{prepare:async()=>orderReference,findPayment:async()=>paymentId,record:async()=>undefined}});
    await provider.initiate({id:paymentId,residentId:paymentId,phone:'+255689123456',amount:3000,currency:'TZS',idempotencyKey:paymentId});
    expect(bodies).toHaveLength(2);
    expect(bodies.every(body=>!('checksum' in body))).toBe(true);
  });

  it('canonicalizes nested payloads and rejects altered checksums', () => {
    const first = { z: 1, nested: { b: 2, a: 1 }, list: [{ y: 2, x: 1 }] };
    const second = { list: [{ x: 1, y: 2 }], nested: { a: 1, b: 2 }, z: 1 };
    expect(createClickPesaChecksum('secret', first)).toBe(createClickPesaChecksum('secret', second));
    const signed = { ...first, checksum: createClickPesaChecksum('secret', first) };
    expect(() => verifyClickPesaChecksum('secret', signed)).not.toThrow();
    expect(() => verifyClickPesaChecksum('secret', { ...signed, z: 2 })).toThrow();
  });

  it('previews and initiates a USSD push with a stable mapped reference', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/generate-token')) return json({ success: true, token: 'token-value' });
      // ClickPesa currently returns 400 here even though its OpenAPI documents 404.
      if (url.endsWith(`/payments/${orderReference}`)) return json({ message: `Invalid or missing payment: ${orderReference}` }, 400);
      if (url.endsWith('/preview-ussd-push-request')) return json({ activeMethods: [{ name: 'M-PESA', status: 'AVAILABLE' }] });
      if (url.endsWith('/initiate-ussd-push-request')) return json({ id: 'CP-TX-1', status: 'PROCESSING', orderReference });
      return json({}, 500);
    }) as unknown as typeof fetch;
    const record = vi.fn(async () => undefined);
    const provider = clickPesaProvider({
      env,
      fetcher,
      tokenCache: new Map(),
      store: {
        prepare: async () => orderReference,
        findPayment: async () => paymentId,
        record,
      },
    });

    await expect(provider.initiate({
      id: paymentId,
      residentId: paymentId,
      phone: '+255712345678',
      amount: 3000,
      currency: 'TZS',
      idempotencyKey: paymentId,
    })).resolves.toEqual({ reference: 'CP-TX-1', status: 'pending' });

    expect(calls.map((call) => call.url)).toEqual([
      `${env.CLICKPESA_API_BASE_URL}/generate-token`,
      `${env.CLICKPESA_API_BASE_URL}/payments/${orderReference}`,
      `${env.CLICKPESA_API_BASE_URL}/payments/preview-ussd-push-request`,
      `${env.CLICKPESA_API_BASE_URL}/payments/initiate-ussd-push-request`,
    ]);
    for (const call of calls.slice(2)) {
      const payload = JSON.parse(String(call.init?.body)) as Record<string, unknown>;
      expect(payload.phoneNumber).toBe('255712345678');
      expect(payload.orderReference).toBe(orderReference);
      expect(() => verifyClickPesaChecksum(env.CLICKPESA_CHECKSUM_KEY, payload)).not.toThrow();
      expect(new Headers(call.init?.headers).get('authorization')).toBe('Bearer token-value');
    }
    expect(record).toHaveBeenCalledWith(paymentId, orderReference, 'CP-TX-1', 'processing');
  });

  it('settles only after a signed webhook and authenticated successful status lookup', async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith('/generate-token')) return json({ success: true, token: 'Bearer token-value' });
      if (url.endsWith(`/payments/${orderReference}`)) return json([{
        id: 'CP-TX-2',
        status: 'SUCCESS',
        paymentReference: 'CP-PAID-2',
        orderReference,
        collectedAmount: 3000,
        collectedCurrency: 'TZS',
        clientId: env.CLICKPESA_CLIENT_ID,
      }]);
      return json({}, 500);
    }) as unknown as typeof fetch;
    const record = vi.fn(async () => undefined);
    const provider = clickPesaProvider({
      env,
      fetcher,
      tokenCache: new Map(),
      store: {
        prepare: async () => orderReference,
        findPayment: async () => paymentId,
        record,
      },
    });
    const unsigned = {
      event: 'PAYMENT RECEIVED',
      data: { id: 'CP-TX-2', status: 'SUCCESS', orderReference },
    };
    const body = JSON.stringify({ ...unsigned, checksum: createClickPesaChecksum(env.CLICKPESA_CHECKSUM_KEY, unsigned) });
    await expect(provider.verifyWebhook(body, new Headers())).resolves.toMatchObject({
      paymentId,
      providerReference: 'CP-PAID-2',
      amount: 3000,
      currency: 'TZS',
    });
    expect(record).toHaveBeenCalledWith(paymentId, orderReference, 'CP-TX-2', 'successful');

    const altered = body.replace('SUCCESS', 'FAILED');
    await expect(provider.verifyWebhook(altered, new Headers())).rejects.toThrow('checksum');
  });

  it('reports when the registered phone network is not active for the merchant', async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith('/generate-token')) return json({ success: true, token: 'token-value' });
      if (url.endsWith(`/payments/${orderReference}`)) return json({ message: `Invalid or missing payment: ${orderReference}` }, 400);
      if (url.endsWith('/preview-ussd-push-request')) return json({
        activeMethods: [{ name: 'TIGO-PESA', status: 'AVAILABLE' }],
        sender: { accountProvider: 'M-PESA' },
      });
      return json({}, 500);
    }) as unknown as typeof fetch;
    const provider = clickPesaProvider({
      env,
      fetcher,
      tokenCache: new Map(),
      store: {
        prepare: async () => orderReference,
        findPayment: async () => paymentId,
        record: async () => undefined,
      },
    });
    await expect(provider.initiate({
      id: paymentId,
      residentId: paymentId,
      phone: '+255712345678',
      amount: 3000,
      currency: 'TZS',
      idempotencyKey: paymentId,
    })).rejects.toMatchObject({ code: 'method_unavailable' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('matches ClickPesa sender aliases to the active mobile-money method', async()=>{
    const fetcher=vi.fn(async(input:URL|RequestInfo)=>{
      const url=String(input);
      if(url.endsWith('/generate-token'))return json({success:true,token:'token-value'});
      if(url.endsWith(`/payments/${orderReference}`))return json({message:`Invalid or missing payment: ${orderReference}`},400);
      if(url.endsWith('/preview-ussd-push-request'))return json({activeMethods:[{name:'AIRTEL-MONEY',status:'AVAILABLE'}],sender:{accountProvider:'AIRTEL'}});
      if(url.endsWith('/initiate-ussd-push-request'))return json({id:'CP-AIRTEL-1',status:'PROCESSING',orderReference});
      return json({},500);
    }) as unknown as typeof fetch;
    const provider=clickPesaProvider({env,fetcher,tokenCache:new Map(),store:{prepare:async()=>orderReference,findPayment:async()=>paymentId,record:async()=>undefined}});
    await expect(provider.initiate({id:paymentId,residentId:paymentId,phone:'+255689123456',amount:3000,currency:'TZS',idempotencyKey:paymentId})).resolves.toMatchObject({reference:'CP-AIRTEL-1'});
  });

  it('reports an insufficient-funds failure when reconciling a delayed result',async()=>{
    const fetcher=vi.fn(async(input:URL|RequestInfo)=>{
      const url=String(input);
      if(url.endsWith('/generate-token'))return json({success:true,token:'token-value'});
      if(url.endsWith(`/payments/${orderReference}`))return json([{id:'CP-FAILED-1',status:'FAILED',orderReference,message:'Insufficient funds in wallet'}]);
      return json({},500);
    }) as unknown as typeof fetch;
    const record=vi.fn(async()=>undefined);
    const provider=clickPesaProvider({env,fetcher,tokenCache:new Map(),store:{prepare:async()=>orderReference,latest:async()=>orderReference,findPayment:async()=>paymentId,record}});
    await expect(provider.reconcile?.(paymentId)).resolves.toEqual({status:'failed',reason:'insufficient_funds'});
    expect(record).toHaveBeenCalledWith(paymentId,orderReference,'CP-FAILED-1','failed');
  });
});
