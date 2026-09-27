import 'server-only';
export async function readWebhookBody(request:Request){
 if(!request.body)throw new Error('Missing body');
 const reader=request.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw new Error('Body too large');}chunks.push(value);}
 return Buffer.concat(chunks).toString('utf8');
}
