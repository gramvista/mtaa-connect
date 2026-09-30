export const SMS_QUEUE_BATCH_LIMIT=10;

export function normalizeSmsBatchLimit(requested=SMS_QUEUE_BATCH_LIMIT){
 if(!Number.isInteger(requested)||requested<1)return SMS_QUEUE_BATCH_LIMIT;
 return Math.min(requested,SMS_QUEUE_BATCH_LIMIT);
}

export async function mapSmsBatch<T,R>(items:readonly T[],worker:(item:T)=>Promise<R>){
 if(items.length>SMS_QUEUE_BATCH_LIMIT)throw new Error('SMS batch exceeds the Worker-safe limit');
 const results:R[]=[];
 for(const item of items)results.push(await worker(item));
 return results;
}
