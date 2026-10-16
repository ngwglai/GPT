import PostalMime, { decodeWords } from 'postal-mime';
import { convert } from 'html-to-text';
import { MailError } from './errors';
import { list, text, type Value } from './imap-parser';
export const MAX_TEXT_BYTES = 128 * 1024;
export const MAX_BODY_CHARS = 40000;
export interface Part { section: string; type: string; charset: string; encoding: string; bytes: number; filename: string | null; attachment: boolean; }
function parameters(value: Value | undefined): Record<string,string> {
  const a=list(value), result:Record<string,string>={};
  for(let i=0;i<a.length-1;i+=2) result[text(a[i]).toLowerCase()]=text(a[i+1]);
  return result;
}
function filename(params: Record<string,string>): string | null {
  // RFC 2231 continuations and charset/language encoded extended parameters.
  let name = params['filename*'] ?? params['name*'];
  let joined = ''; let extended = false;
  for(let i=0;i<32;i++) {
    const v=params[`filename*${i}*`] ?? params[`filename*${i}`] ?? params[`name*${i}*`] ?? params[`name*${i}`];
    if(v === undefined) break; joined += v; extended ||= (`filename*${i}*` in params || `name*${i}*` in params);
  }
  if(joined) name=joined;
  if(name) {
    try {
      const match=/^([^']*)'[^']*'(.*)$/s.exec(name);
      if(match || extended) {
        const payload=match?.[2] ?? name; const bytes:number[]=[];
        for(let i=0;i<payload.length;i++) {
          if(payload[i]==='%' && /^[0-9a-f]{2}$/i.test(payload.slice(i+1,i+3))) { bytes.push(parseInt(payload.slice(i+1,i+3),16)); i+=2; }
          else bytes.push(payload.charCodeAt(i));
        }
        return new TextDecoder(match?.[1] || 'utf-8').decode(new Uint8Array(bytes)).slice(0,512);
      }
      return decodeWords(name).slice(0,512);
    } catch { return name.slice(0,512); }
  }
  const simple=params.filename ?? params.name;
  return simple ? decodeWords(simple).slice(0,512) : null;
}
export function bodyParts(value: Value | undefined): Part[] {
  const result:Part[]=[];
  function walk(node:Value[], section:string, depth:number, inheritedAttachment=false) {
    if(depth>20 || result.length>=100 || !node.length) throw new MailError('MIME_TOO_COMPLEX');
    if(Array.isArray(node[0])) {
      let n=0; while(Array.isArray(node[n])) n++;
      const disposition=list(node[n+2]);
      const attached=inheritedAttachment || text(disposition[0]).toLowerCase()==='attachment';
      for(let i=0;i<n;i++) walk(list(node[i]),section ? `${section}.${i+1}` : `${i+1}`,depth+1,attached);
      return;
    }
    const main=text(node[0]).toLowerCase(), sub=text(node[1]).toLowerCase();
    const disposition=list(node[main==='text'?9:main==='message'&&sub==='rfc822'?11:8]);
    const params={...parameters(node[2]),...parameters(disposition[1])};
    const name=filename(params); const bytes=Number(text(node[6]));
    if(!Number.isSafeInteger(bytes)||bytes<0) throw new MailError('IMAP_PROTOCOL');
    result.push({section:section||'1',type:`${main}/${sub}`,charset:params.charset||'utf-8',encoding:text(node[5]),bytes,filename:name,
      attachment:inheritedAttachment || !!name || text(disposition[0]).toLowerCase()==='attachment' || main!=='text' || !['plain','html'].includes(sub)});
  }
  walk(list(value),'',0); return result;
}
export const mimeOptions = {maxNestingDepth:20,maxHeadersSize:32768,maxPartCount:100,maxRfc822NestingDepth:0};
export async function parseHeaders(raw:Uint8Array) {
  if(raw.length>32768) throw new MailError('HEADERS_TOO_LARGE');
  const mail=await PostalMime.parse(raw,mimeOptions);
  return {from:mail.from??null,to:mail.to??[],cc:mail.cc??[],subject:mail.subject??'',date:mail.date??null,messageId:mail.messageId??null};
}
export function htmlText(html:string):string {
  return convert(html,{wordwrap:false,limits:{maxInputLength:MAX_TEXT_BYTES,maxDepth:30,maxChildNodes:10000},selectors:[
    {selector:'a',options:{ignoreHref:true}}, {selector:'img',format:'skip'}, {selector:'script',format:'skip'}, {selector:'style',format:'skip'},
    {selector:'iframe',format:'skip'}, {selector:'object',format:'skip'}, {selector:'form',format:'skip'}
  ]});
}
export async function parseTextPart(part:Part, raw:Uint8Array):Promise<string> {
  if(raw.length>MAX_TEXT_BYTES) throw new MailError('MAIL_TOO_LARGE');
  if(!/^[a-z0-9_-]{1,40}$/i.test(part.charset) || !/^(7BIT|8BIT|BINARY|BASE64|QUOTED-PRINTABLE)$/i.test(part.encoding) || !/^text\/(plain|html)$/.test(part.type)) throw new MailError('MIME_UNSUPPORTED');
  const header=new TextEncoder().encode(`Content-Type: ${part.type}; charset="${part.charset}"\r\nContent-Transfer-Encoding: ${part.encoding}\r\n\r\n`);
  const message=new Uint8Array(header.length+raw.length);message.set(header);message.set(raw,header.length);
  const parsed=await PostalMime.parse(message,mimeOptions);
  return part.type==='text/html'?htmlText(parsed.html??''):parsed.text??'';
}
export function attachmentMetadata(parts:Part[]) {
  return parts.filter(p=>p.attachment).map(p=>({filename:p.filename,contentType:p.type,size:p.bytes,sizeUnit:'encoded-octets',encoding:p.encoding}));
}
