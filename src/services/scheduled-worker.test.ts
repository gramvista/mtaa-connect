import { describe,expect,it,vi } from 'vitest';
import { dispatchScheduledWorker,INTERNAL_WORKER_URL } from './scheduled-worker';

describe('scheduled worker dispatch',()=>{
 it('dispatches once through the provided app handler without a public self-fetch',async()=>{
  const publicFetch=vi.spyOn(globalThis,'fetch');
  const handler=vi.fn(async(request:Request)=>{
   expect(request.url).toBe(INTERNAL_WORKER_URL);
   expect(request.method).toBe('POST');
   expect(request.headers.get('authorization')).toBe('Bearer test-worker-secret');
   return new Response(null,{status:200});
  });
  await dispatchScheduledWorker('test-worker-secret',handler);
  expect(handler).toHaveBeenCalledTimes(1);
  expect(publicFetch).not.toHaveBeenCalled();
  publicFetch.mockRestore();
 });

 it('stops after one failed internal dispatch',async()=>{
  const handler=vi.fn(async()=>new Response(null,{status:503}));
  await expect(dispatchScheduledWorker('test-worker-secret',handler)).rejects.toThrow('HTTP 503');
  expect(handler).toHaveBeenCalledTimes(1);
 });
});
