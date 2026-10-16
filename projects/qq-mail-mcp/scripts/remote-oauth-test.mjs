// Temporary acceptance only. Password is provided on stdin, never in argv, files or logs.
import {createInterface} from 'node:readline/promises';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const origin=process.env.MCP_ORIGIN;
assert.ok(origin?.startsWith('https://'));
const rl=createInterface({input:process.stdin,terminal:false});
const password=await new Promise(resolve=>rl.once('line',resolve));rl.close();
const redirect='https://chatgpt.com/connector_platform_oauth_redirect';
const request=(path,init={})=>fetch(origin+path,{...init,redirect:'manual',signal:AbortSignal.timeout(30000)});
let clientId,accessToken;
try{
 const registration=await request('/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({redirect_uris:[redirect],token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code'],scope:'mail:read'})});assert.equal(registration.status,201);
 clientId=(await registration.json()).client_id;
 const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
 const params=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:'mail:read',resource:origin+'/mcp',code_challenge:challenge,code_challenge_method:'S256',state:'acceptance-check'});
 const consentPage=await request('/authorize?'+params);assert.equal(consentPage.status,200);
 const cookie=consentPage.headers.get('set-cookie').split(';')[0];const html=await consentPage.text();const nonce=/name="nonce" value="([^"]+)"/.exec(html)[1];
 const consent=await request('/authorize',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:origin,Cookie:cookie},body:new URLSearchParams({nonce,password,decision:'allow'})});assert.equal(consent.status,303);
 const callback=new URL(consent.headers.get('location'));assert.equal(callback.searchParams.get('state'),'acceptance-check');assert.equal(callback.searchParams.get('iss'),origin);
 const exchange=new URLSearchParams({grant_type:'authorization_code',client_id:clientId,redirect_uri:redirect,code_verifier:verifier,code:callback.searchParams.get('code'),resource:origin+'/mcp'});
 const tokenResponse=await request('/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:exchange});assert.equal(tokenResponse.status,200);accessToken=(await tokenResponse.json()).access_token;
 const replay=await request('/token',{method:'POST',body:exchange});assert.equal(replay.status,400);
 const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:'Bearer '+accessToken};
 async function rpc(method,params){const r=await request('/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});assert.equal(r.status,200);const j=await r.json();assert.ok(!j.error);return j.result;}
 const init=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'remote-acceptance',version:'1'}});assert.equal(init.serverInfo.name,'qq-mail-mcp');
 const {tools}=await rpc('tools/list',{});assert.equal(tools.length,6);assert.ok(tools.every(t=>t.annotations.readOnlyHint));
 const status=await rpc('tools/call',{name:'mail_status',arguments:{}});assert.ok(!status.isError);assert.equal(JSON.parse(status.content[0].text).data.error,'MAIL_NOT_CONFIGURED');
 const invalid=await rpc('tools/call',{name:'mail_read',arguments:{uid:0}});assert.equal(invalid.isError,true);
 await request('/revoke',{method:'POST',body:new URLSearchParams({token:accessToken})});
 const revoked=await request('/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});assert.equal(revoked.status,401);
 console.log(JSON.stringify({success:true,clientId,checks:['DCR','consent','PKCE exchange','code replay rejected','MCP initialize','six read-only tools','authorized mail_status (unconfigured)','invalid UID rejected','token revoked']}));
}catch(error){console.log(JSON.stringify({success:false,clientId,error:error.code??error.name}));process.exitCode=1;}
finally{if(accessToken)await request('/revoke',{method:'POST',body:new URLSearchParams({token:accessToken})}).catch(()=>{});}
