import type { MailSocket } from '../src/imap';
const encoder=new TextEncoder();
export const header='From: =?UTF-8?B?5rWL6K+V?= <sender@example.com>\r\nTo: recipient@example.com\r\nCc: copy@example.com\r\nSubject: =?UTF-8?B?5Lit5paH5Li76aKY?=\r\nDate: Tue, 13 Oct 2026 10:00:00 +0800\r\nMessage-ID: <test@example.com>\r\n\r\n';
export const body='5L2g5aW977yM5LiW55WM';
export const structure=`(("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "BASE64" ${body.length} 1 NIL NIL)("APPLICATION" "PDF" ("NAME" "file.pdf") NIL NIL "BASE64" 999999 NIL ("ATTACHMENT" ("FILENAME" "file.pdf"))) "MIXED")`;
export function literal(s:string){return `{${encoder.encode(s).length}}\r\n${s}`;}
export function fakeSocket(options:{loginFail?:boolean;hang?:boolean;disconnect?:boolean;large?:boolean;missing?:number;uidvalidity?:number;body?:string;chunkSize?:number}={}) {
  let controller:ReadableStreamDefaultController<Uint8Array>;const commands:string[]=[];let closed=false;let seen=false;
  const send=(s:string)=>{const b=encoder.encode(s);for(let i=0;i<b.length;i+=(options.chunkSize??7))controller.enqueue(b.slice(i,i+(options.chunkSize??7)));};
  const socket:MailSocket={
    opened:Promise.resolve({}),closed:Promise.resolve(),
    readable:new ReadableStream({start(c){controller=c;if(!options.hang)send('* OK QQ IMAP ready\r\n');}}),
    writable:new WritableStream({write(chunk){const cmd=new TextDecoder().decode(chunk);commands.push(cmd);const tag=cmd.split(' ')[0];
      if(options.disconnect){controller.close();return;}
      let response='';
      if(cmd.includes(' LOGIN ')){if(options.loginFail){send(`${tag} NO bad password (private detail)\r\n`);return;}}
      else if(cmd.includes(' LIST ')) response='* LIST (\\HasNoChildren) "/" "INBOX"\r\n* LIST (\\HasNoChildren) "/" "&XfJT0ZAB-"\r\n* LIST (\\Noselect) "/" "Parent"\r\n';
      else if(cmd.includes(' EXAMINE ')) response=`* FLAGS (\\Seen)\r\n* OK [UIDVALIDITY ${options.uidvalidity??77}] valid\r\n`;
      else if(cmd.includes(' UID SEARCH ')) response='* SEARCH '+Array.from({length:45},(_,i)=>i+1).join(' ')+'\r\n';
      else if(cmd.includes(' UID FETCH ')){
        const uid=Number(/UID FETCH (\d+)/.exec(cmd)![1]);
        if(uid!==options.missing){let attrs=`UID ${uid}`;
          if(cmd.includes('RFC822.SIZE'))attrs+=' RFC822.SIZE 1000200';
          if(cmd.includes('BODYSTRUCTURE'))attrs+=' BODYSTRUCTURE '+(options.large?'("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "BASE64" 200000 1 NIL NIL)':structure.replace(` ${body.length} 1`, ` ${(options.body??body).length} 1`));
          if(cmd.includes('BODY.PEEK[HEADER]'))attrs+=' BODY[HEADER] '+literal(header);
          if(cmd.includes('BODY.PEEK[1]'))attrs+=' BODY[1] '+literal(options.body??body);
          if(cmd.includes('FLAGS'))attrs+=' FLAGS ('+(seen?'\\Seen':'')+')';
          if(/BODY\[/.test(cmd))seen=true;
          response=`* 1 FETCH (${attrs})\r\n`;
        }
      }else throw new Error('Unexpected command: '+cmd);
      send(response+`${tag} OK done\r\n`);
    }}),
    async close(){if(!closed){closed=true;try{controller.close();}catch{}}}
  };
  return {socket,commands,get closed(){return closed;},get seen(){return seen;}};
}
