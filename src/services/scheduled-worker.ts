export const INTERNAL_WORKER_URL='https://mtaa.gramvistaempiregroup.com/api/internal/worker';

export async function dispatchScheduledWorker(secret:string,handler:(request:Request)=>Promise<Response>){
 const request=new Request(INTERNAL_WORKER_URL,{method:'POST',headers:{authorization:`Bearer ${secret}`}});
 const response=await handler(request);
 if(!response.ok)throw new Error(`Scheduled worker returned HTTP ${response.status}`);
}
