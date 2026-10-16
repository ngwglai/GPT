import assert from 'node:assert/strict';
const origin=process.env.MCP_ORIGIN;
if(!origin?.startsWith('https://'))throw Error('Set MCP_ORIGIN to the deployed HTTPS origin');
const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
async function request(path,options){const r=await fetch(origin+path,{...options,signal:AbortSignal.timeout(30000)});return r;}
const health=await request('/health');assert.equal(health.status,200);assert.equal((await health.json()).readOnly,true);
const denied=await request('/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});assert.equal(denied.status,401);assert.match(denied.headers.get('www-authenticate'),/oauth-protected-resource/);
const metadata=await (await request('/.well-known/oauth-protected-resource')).json();assert.equal(metadata.resource,origin+'/mcp');
const auth=await (await request('/.well-known/oauth-authorization-server')).json();assert.ok(auth.code_challenge_methods_supported.includes('S256'));
console.log('PASS HTTPS health, unauthorized MCP rejection, OAuth discovery');
if(process.env.MCP_TEST_ACCESS_TOKEN){
 headers.Authorization='Bearer '+process.env.MCP_TEST_ACCESS_TOKEN;
 async function rpc(method,params){const r=await request('/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});assert.equal(r.status,200);const j=await r.json();assert.ok(!j.error);return j.result;}
 const init=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'acceptance',version:'1.0'}});assert.equal(init.serverInfo.name,'qq-mail-mcp');
 const {tools}=await rpc('tools/list',{});assert.equal(tools.length,6);assert.ok(tools.every(t=>t.annotations.readOnlyHint));
 const status=await rpc('tools/call',{name:'mail_status',arguments:{}});assert.ok(!status.isError);
 const value=JSON.parse(status.content[0].text).data;
 console.log('PASS authenticated initialization, six tools, mail_status; mailbox authenticated:',value.authenticated===true);
 if(process.env.MCP_TEST_UID && process.env.MCP_TEST_UIDVALIDITY){
   const read=await rpc('tools/call',{name:'mail_read',arguments:{folder:process.env.MCP_TEST_FOLDER||'INBOX',uid:Number(process.env.MCP_TEST_UID),uidvalidity:Number(process.env.MCP_TEST_UIDVALIDITY)}});assert.ok(!read.isError);console.log('PASS specified mail read (content not logged)');
 }
}else console.log('SKIP authenticated tests: MCP_TEST_ACCESS_TOKEN not supplied');
