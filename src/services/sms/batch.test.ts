import { describe,expect,it,vi } from 'vitest';
import { mapSmsBatch,normalizeSmsBatchLimit,SMS_QUEUE_BATCH_LIMIT } from './batch';

describe('SMS Worker batches',()=>{
 it('clamps every requested queue batch to the Worker-safe maximum',()=>{
  expect(normalizeSmsBatchLimit(25)).toBe(SMS_QUEUE_BATCH_LIMIT);
  expect(normalizeSmsBatchLimit(3)).toBe(3);
  expect(normalizeSmsBatchLimit(0)).toBe(SMS_QUEUE_BATCH_LIMIT);
 });

 it('processes a bounded batch sequentially',async()=>{
  let active=0,maxActive=0;
  const worker=vi.fn(async(value:number)=>{active++;maxActive=Math.max(maxActive,active);await Promise.resolve();active--;return value*2;});
  await expect(mapSmsBatch([1,2,3],worker)).resolves.toEqual([2,4,6]);
  expect(maxActive).toBe(1);
 });

 it('rejects an oversized batch before starting provider work',async()=>{
  const worker=vi.fn(async(value:number)=>value);
  await expect(mapSmsBatch(Array.from({length:SMS_QUEUE_BATCH_LIMIT+1},(_,index)=>index),worker)).rejects.toThrow('safe limit');
  expect(worker).not.toHaveBeenCalled();
 });
});
