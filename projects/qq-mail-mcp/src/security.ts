import { timingSafeEqual } from 'node:crypto';
import { MailError } from './errors';
export function randomToken():string {return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');}
export async function hash(value:string):Promise<string> {return Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('base64url');}
export async function equal(a:string,b:string):Promise<boolean> {return timingSafeEqual(Buffer.from(await hash(a)),Buffer.from(await hash(b)));}
export async function boundedBody(request:Request,max=16384):Promise<string> {
  if(Number(request.headers.get('content-length')??0)>max) throw new MailError('REQUEST_TOO_LARGE');
  const reader=request.body?.getReader(); if(!reader) return '';
  let length=0;const chunks:Uint8Array[]=[];let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const read=async()=>{for(;;){const {value,done}=await reader.read();if(done) break;length+=value.length;if(length>max) throw new MailError('REQUEST_TOO_LARGE');chunks.push(value);}};
    await Promise.race([read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new MailError('TIMEOUT'));},5000);})]);
  } finally {if(timer)clearTimeout(timer);await reader.cancel().catch(()=>{});reader.releaseLock();}
  const data=new Uint8Array(length);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}return new TextDecoder().decode(data);
}
export function json(value:unknown,status=200,headers:Record<string,string>={}):Response {return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
export function escapeHtml(value:string):string {return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
