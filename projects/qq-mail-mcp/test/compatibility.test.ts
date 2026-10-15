import { it,expect } from 'vitest';
import { handleMcp } from '../src/mcp';
import { MailService } from '../src/mail';
const base='https://mail-mcp.example.com';
const mail=new MailService({},()=>{throw new Error('Must not dial during protocol checks');});
const headers={'Content-Type':'application/json; charset=utf-8',Accept:'application/json, text/event-stream'};
it.each(['2024-11-05','2025-03-26','2025-06-18','2025-11-25'])('negotiates MCP %s with JSON content type',async(protocolVersion)=>{
 const body={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion,capabilities:{},clientInfo:{name:'compatibility-test',version:'1'}}};
 const r=await handleMcp(new Request(base+'/mcp',{method:'POST',headers,body:JSON.stringify(body)}),mail,body);
 expect(r.status).toBe(200);expect(r.headers.get('content-type')).toContain('application/json');
 const result=await r.json() as {result:{protocolVersion:string}};expect(result.result.protocolVersion).toBe(protocolVersion);
});
it('accepts standard MCP header and returns six tool schemas',async()=>{
 const body={jsonrpc:'2.0',id:2,method:'tools/list',params:{}};
 const r=await handleMcp(new Request(base+'/mcp',{method:'POST',headers:{...headers,'MCP-Protocol-Version':'2025-06-18'},body:JSON.stringify(body)}),mail,body);
 const result=await r.json() as {result:{tools:{inputSchema:{type:string}}[]}};expect(r.status).toBe(200);expect(result.result.tools).toHaveLength(6);expect(result.result.tools.every(t=>t.inputSchema.type==='object')).toBe(true);
});
