import { z } from 'zod';
import { MailError, errorCode } from './errors';
import { ImapClient, field, type Dial } from './imap';
import { decodeFolder, list, quote, text, type Value } from './imap-parser';
import { bodyParts, attachmentMetadata, parseHeaders, parseTextPart, MAX_TEXT_BYTES, MAX_BODY_CHARS } from './mime';
const safe=z.string().min(1).max(256).regex(/^[^\x00-\x1f\x7f]*$/);
const uid=z.number().int().min(1).max(4294967295);
const folder=safe.default('INBOX');
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s,'Invalid calendar date');
export const searchSchema=z.object({folder,from:safe.optional(),subject:safe.optional(),keyword:safe.optional(),since:date.optional(),before:date.optional(),unread:z.boolean().optional(),page:z.number().int().min(1).max(500).default(1),limit:z.number().int().min(1).max(20).default(20)}).strict().refine(s=>!s.since||!s.before||s.since<s.before,'since must precede before');
export const readSchema=z.object({folder,uid,uidvalidity:uid}).strict();
export const batchSchema=z.object({folder,uidvalidity:uid,uids:z.array(uid).min(1).max(3).refine(a=>new Set(a).size===a.length,'Duplicate UIDs')}).strict();
export const folderSchema=z.object({}).strict();
export type Search=z.infer<typeof searchSchema>;
export type Read=z.infer<typeof readSchema>;
function imapDate(s:string):string {const [y,m,d]=s.split('-');return `${Number(d)}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m)-1]}-${y}`;}
export function searchCriteria(s:Search):string {
  const parts=['ALL'];
  for(const [k,v] of [['FROM',s.from],['SUBJECT',s.subject],['TEXT',s.keyword]] as const) if(v) parts.push(k,quote(v));
  if(s.since) parts.push('SINCE',imapDate(s.since));if(s.before) parts.push('BEFORE',imapDate(s.before));
  if(s.unread!==undefined) parts.push(s.unread?'UNSEEN':'SEEN');return parts.join(' ');
}
function literal(v:Value|undefined):Uint8Array {if(!(v instanceof Uint8Array)) throw new MailError('IMAP_PROTOCOL');return v;}
export class MailService {
  constructor(private credentials:{QQ_MAIL_ADDRESS?:string;QQ_MAIL_AUTH_CODE?:string},private dial:Dial) {}
  private async session<T>(action:(client:ImapClient)=>Promise<T>):Promise<T> {
    if(!this.credentials.QQ_MAIL_ADDRESS||!this.credentials.QQ_MAIL_AUTH_CODE) throw new MailError('MAIL_NOT_CONFIGURED');
    const c=new ImapClient(this.dial());
    try {await c.login(this.credentials.QQ_MAIL_ADDRESS,this.credentials.QQ_MAIL_AUTH_CODE);return await action(c);} finally {await c.close();}
  }
  async status() {
    if(!this.credentials.QQ_MAIL_ADDRESS||!this.credentials.QQ_MAIL_AUTH_CODE) return {connected:false,authenticated:false,error:'MAIL_NOT_CONFIGURED'};
    let c:ImapClient|undefined;
    try {c=new ImapClient(this.dial());await c.login(this.credentials.QQ_MAIL_ADDRESS,this.credentials.QQ_MAIL_AUTH_CODE);return {connected:true,authenticated:true};}
    catch(e) {return {connected:c?.connected??false,authenticated:false,error:errorCode(e)};} finally {await c?.close();}
  }
  async folders() {return this.session(async c=>(await c.folders()).filter(r=>!list(r[2]).some(v=>text(v).toLowerCase()==='\\noselect')).slice(0,200).map(r=>({name:decodeFolder(text(r[4])),delimiter:text(r[3]),flags:list(r[2]).map(text)})));}
  async search(input:Search) {return this.session(async c=>{
    const uidvalidity=await c.examine(input.folder);
    const uids=[...new Set(await c.search(searchCriteria(input)))].sort((a,b)=>b-a);
    const page=uids.slice((input.page-1)*input.limit,input.page*input.limit);const messages=[];
    for(const uid of page) {
      try {const values=await c.fetch(uid,'UID RFC822.SIZE BODY.PEEK[HEADER]'); const headers=await parseHeaders(literal(field(values,'BODY[HEADER]')));
        messages.push({uid,uidvalidity,...headers,size:Number(text(field(values,'RFC822.SIZE')))});
      } catch(e) {if(errorCode(e)==='MAIL_NOT_FOUND') continue;throw e;}
    }
    return {folder:input.folder,uidvalidity,total:uids.length,page:input.page,limit:input.limit,hasMore:input.page*input.limit<uids.length,messages};
  });}
  private async readSelected(c:ImapClient,input:Read,metadataOnly=false) {
    const values=await c.fetch(input.uid,'UID RFC822.SIZE BODYSTRUCTURE');
    const parts=bodyParts(field(values,'BODYSTRUCTURE'));
    const attachments=attachmentMetadata(parts);
    if(metadataOnly) return {uid:input.uid,uidvalidity:input.uidvalidity,folder:input.folder,attachments};
    let selected=parts.filter(p=>!p.attachment && p.type==='text/plain');
    if(!selected.length) selected=parts.filter(p=>!p.attachment && p.type==='text/html');
    if(selected.length>8 || selected.reduce((sum,p)=>sum+p.bytes,0)>MAX_TEXT_BYTES) throw new MailError('MAIL_TOO_LARGE');
    const header=await c.fetch(input.uid,'UID BODY.PEEK[HEADER]');
    const headers=await parseHeaders(literal(field(header,'BODY[HEADER]')));let body='';let bytes=0;
    for(const part of selected) {
      const fetched=await c.fetch(input.uid,`UID BODY.PEEK[${part.section}]`);
      const raw=literal(field(fetched,`BODY[${part.section}]`)); bytes+=raw.length;
      if(bytes>MAX_TEXT_BYTES) throw new MailError('MAIL_TOO_LARGE');
      body+=(body?'\n\n':'')+await parseTextPart(part,raw);
    }
    return {uid:input.uid,uidvalidity:input.uidvalidity,folder:input.folder,...headers,body:body.slice(0,MAX_BODY_CHARS),truncated:body.length>MAX_BODY_CHARS,attachments,untrustedContent:true};
  }
  async read(input:Read,metadataOnly=false) {return this.session(async c=>{
    if(await c.examine(input.folder)!==input.uidvalidity) throw new MailError('UIDVALIDITY_CHANGED');
    return this.readSelected(c,input,metadataOnly);
  });}
  async batch(input:z.infer<typeof batchSchema>) {return this.session(async c=>{
    if(await c.examine(input.folder)!==input.uidvalidity) throw new MailError('UIDVALIDITY_CHANGED');
    const results=[];const start=Date.now();let used=0;let failedConnection=false;
    for(const uid of input.uids) {
      if(failedConnection||Date.now()-start>14000||used>=256*1024) {results.push({uid,success:false,error:'BATCH_LIMIT'});continue;}
      try {const mail=await this.readSelected(c,{...input,uid});const bytes=new TextEncoder().encode(JSON.stringify(mail)).length;if(used+bytes>256*1024){results.push({uid,success:false,error:'BATCH_LIMIT'});used=256*1024;}else{used+=bytes;results.push({uid,success:true,mail});}}
      catch(e) {const code=errorCode(e);results.push({uid,success:false,error:code});failedConnection=!['MAIL_TOO_LARGE','MAIL_NOT_FOUND','MIME_UNSUPPORTED','MIME_TOO_COMPLEX'].includes(code);}
    }
    return {results};
  });}
}
