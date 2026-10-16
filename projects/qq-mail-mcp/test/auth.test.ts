import { chromium } from 'playwright-core';
import { beforeAll,afterAll,beforeEach,describe,it,expect } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import worker from '../src/index';
import { oauth,authorized,metadata } from '../src/oauth';
import { hash,randomToken } from '../src/security';
import { handleMcp } from '../src/mcp';
import { MailService } from '../src/mail';
import { fakeSocket } from './fixture';
let mf:Miniflare;let env:Env;
const base='https://mail-mcp.example.com';
const redirect='https://chatgpt.com/connector_platform_oauth_redirect';
const req=(path:string,init:RequestInit={})=>new Request(base+path,init);
async function asJson(response:Response){return await response.json() as Record<string,any>;}
async function register(){const r=await oauth(req('/register',{method:'POST',body:JSON.stringify({redirect_uris:[redirect],token_endpoint_auth_method:'none'})}),env);expect(r.status).toBe(201);return (await asJson(r)).client_id as string;}
async function start(client_id:string,verifier:string,extra:Record<string,string>={}) {
 const p=new URLSearchParams({client_id,redirect_uri:redirect,response_type:'code',scope:'mail:read',resource:base+'/mcp',code_challenge:await hash(verifier),code_challenge_method:'S256',state:'test-state',...extra});
 const r=await oauth(req('/authorize?'+p),env);const html=await r.text();
 return {r,nonce:/name="nonce" value="([^"]+)"/.exec(html)?.[1]??'',cookie:r.headers.get('set-cookie')?.split(';')[0]??''};
}
async function consent(s:Awaited<ReturnType<typeof start>>,password=env.OWNER_PASSWORD,origin=base) {
 return oauth(req('/authorize',{method:'POST',headers:{Origin:origin,Cookie:s.cookie},body:new URLSearchParams({nonce:s.nonce,password,decision:'allow'})}),env);
}
async function issueCode(clientId:string,verifier:string) {const s=await start(clientId,verifier);expect(s.r.status).toBe(200);const r=await consent(s);expect(r.status).toBe(303);const callback=new URL(r.headers.get('location')!);expect(callback.searchParams.get('state')).toBe('test-state');expect(callback.searchParams.get('iss')).toBe(base);return callback.searchParams.get('code')!;}
async function exchange(clientId:string,verifier:string,code:string,extra:Record<string,string>={}) {
 return oauth(req('/token',{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,redirect_uri:redirect,code_verifier:verifier,code,resource:base+'/mcp',...extra})}),env);
}
beforeAll(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-10-15',d1Databases:['AUTH_DB']}));
 const db=await mf.getD1Database('AUTH_DB');
 await db.exec((await readFile('migrations/0001_auth.sql','utf8')).replace(/\n/g,' '));
 env={AUTH_DB:db as D1Database,RATE_LIMITER:{limit:async()=>({success:true})},PUBLIC_ORIGIN:base,OAUTH_REDIRECT_URIS:redirect,OWNER_PASSWORD:randomToken(),QQ_MAIL_ADDRESS:'',QQ_MAIL_AUTH_CODE:''};
});
afterAll(async()=>{await mf?.dispose();});
beforeEach(async()=>{await env.AUTH_DB.exec('DELETE FROM oauth_grants; DELETE FROM oauth_clients;');});
describe('OAuth 2.1 with actual local D1',()=>{
 it('advertises precise discovery, scope and PKCE',()=>{expect(metadata(env)).toMatchObject({issuer:base,code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']});expect(metadata(env,true)).toMatchObject({resource:base+'/mcp'});});
 it('rejects non-allowlisted redirect registration',async()=>{const r=await oauth(req('/register',{method:'POST',body:JSON.stringify({redirect_uris:['https://attacker.invalid/']})}),env);expect(r.status).toBe(400);});
 it('negotiates requested refresh to the implemented authorization code grant',async()=>{
   const detail:import('../src/diagnostics').Diagnostic={};
   const r=await oauth(req('/register',{method:'POST',body:JSON.stringify({redirect_uris:[redirect],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})}),env,detail);
   expect(r.status).toBe(201);const registered=await asJson(r);
   expect(registered.grant_types).toEqual(['authorization_code']);expect(metadata(env).grant_types_supported).toEqual(registered.grant_types);
   expect(detail.requestedGrants).toEqual(['authorization_code','refresh_token']);
   const v=randomToken(),code=await issueCode(registered.client_id,v);
   const tokens=await asJson(await exchange(registered.client_id,v,code));expect(tokens.refresh_token).toBeUndefined();
   expect(await authorized(req('/mcp',{headers:{Authorization:'Bearer '+tokens.access_token}}),env)).toBe(true);
 });
 it('rejects malformed or incompatible grants without logging arbitrary values',async()=>{
   for(const grants of [[],['refresh_token'],['client_credentials'],['authorization_code','PRIVATE_GRANT'],'PRIVATE_GRANT']) {
     const detail:import('../src/diagnostics').Diagnostic={};
     const r=await oauth(req('/register',{method:'POST',body:JSON.stringify({redirect_uris:[redirect],grant_types:grants})}),env,detail);
     expect(r.status).toBe(400);expect(detail.invalidFields).toContain('grant_types');expect(JSON.stringify(detail)).not.toContain('PRIVATE_GRANT');
   }
 });
 it('requires PKCE S256, exact resource, exact redirect and scope',async()=>{const id=await register();for(const extra of ([{code_challenge_method:'plain'},{resource:base},{redirect_uri:'https://attacker.invalid/'},{scope:'mail:write'}] as Record<string,string>[]))expect((await start(id,randomToken(),extra)).r.status).toBe(400);});
 it('rejects wrong password and cross-site consent',async()=>{const id=await register();const s=await start(id,randomToken());expect((await consent(s,'wrong')).status).toBe(403);expect((await consent(s,env.OWNER_PASSWORD,'https://attacker.invalid')).status).toBe(403);expect((await consent({...s,cookie:''})).status).toBe(403);});
 it('consumes consent exactly once',async()=>{const s=await start(await register(),randomToken());const result=await Promise.all([consent(s),consent(s)]);expect(result.map(r=>r.status).sort()).toEqual([303,403]);});
 it('validates wrong verifier/client/resource and permits one successful code exchange',async()=>{
   const id=await register(),v=randomToken(),code=await issueCode(id,v);
   expect((await exchange(id,randomToken(),code)).status).toBe(400);
   expect((await exchange('wrong',v,code)).status).toBe(400);
   expect((await exchange(id,v,code,{resource:'https://attacker.invalid/mcp'})).status).toBe(400);
   const results=await Promise.all([exchange(id,v,code),exchange(id,v,code)]);expect(results.map(r=>r.status).sort()).toEqual([200,400]);
   const token=(await asJson(results.find(r=>r.status===200)!)).access_token;
   expect(await authorized(req('/mcp',{headers:{Authorization:'Bearer '+token}}),env)).toBe(true);
   expect(await authorized(req('/mcp',{headers:{Authorization:'Bearer '+randomToken()}}),env)).toBe(false);
   const stored=await env.AUTH_DB.prepare("SELECT hash FROM oauth_grants WHERE kind='access'").first<{hash:string}>();expect(stored?.hash).not.toBe(token);
   const lifetime=await env.AUTH_DB.prepare("SELECT expires FROM oauth_grants WHERE kind='access'").first<{expires:number}>();
   expect(lifetime!.expires-Math.floor(Date.now()/1000)).toBeGreaterThan(31535990);
   expect(lifetime!.expires-Math.floor(Date.now()/1000)).toBeLessThanOrEqual(31536000);
   await oauth(req('/revoke',{method:'POST',body:new URLSearchParams({token})}),env);expect(await authorized(req('/mcp',{headers:{Authorization:'Bearer '+token}}),env)).toBe(false);
 });
 it('rejects expired authorization codes',async()=>{const id=await register(),v=randomToken(),code=await issueCode(id,v);await env.AUTH_DB.exec("UPDATE oauth_grants SET expires=0");expect((await exchange(id,v,code)).status).toBe(400);});
 it('distinguishes short owner configuration without exposing the value or length',async()=>{const detail:import('../src/diagnostics').Diagnostic={};const r=await oauth(req('/register',{method:'POST',body:'{}'}),{...env,OWNER_PASSWORD:'short-test-password'},detail);expect(r.status).toBe(503);expect(detail).toEqual({reason:'owner_password_too_short'});expect(await r.text()).not.toMatch(/short-test-password|too_short/);});
 it('fails closed when owner secret missing',async()=>{const r=await oauth(req('/register',{method:'POST',body:'{}'}),{...env,OWNER_PASSWORD:''});expect(r.status).toBe(503);});
});
describe('HTTP security and official MCP SDK',()=>{
 it('ChatGPT Origin does not bypass OAuth on POST or OPTIONS',async()=>{for(const method of ['POST','OPTIONS']){const r=await worker.fetch(req('/mcp',{method,headers:{Origin:'https://chatgpt.com','Content-Type':'application/json',Accept:'application/json, text/event-stream'}}),env);expect(r.status).toBe(401);expect(r.headers.get('www-authenticate')).toContain('resource_metadata=');}});
 it('keeps health public and all MCP discovery private',async()=>{expect((await worker.fetch(req('/health'),env)).status).toBe(200);const r=await worker.fetch(req('/mcp',{method:'POST',body:'{}'}),env);expect(r.status).toBe(401);expect(r.headers.get('www-authenticate')).toContain('oauth-protected-resource');});
 it('rejects hostile origins and hosts',async()=>{expect((await worker.fetch(req('/mcp',{headers:{Origin:'https://attacker.invalid'}}),env)).status).toBe(403);expect((await worker.fetch(new Request('https://attacker.invalid/health'),env)).status).toBe(400);});
 it('enforces rate limits and fails closed without limiter',async()=>{expect((await worker.fetch(req('/mcp'),{...env,RATE_LIMITER:{limit:async()=>({success:false})}})).status).toBe(429);});
 it('initializes, discovers six read-only tools and calls through authorized HTTP',async()=>{
   const id=await register(),v=randomToken(),code=await issueCode(id,v);const token=(await asJson(await exchange(id,v,code))).access_token;
   const call=async(method:string,params:object)=>worker.fetch(req('/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),env);
   const init=await asJson(await call('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}));expect(init.result.serverInfo.name).toBe('qq-mail-mcp');
   const tools=(await asJson(await call('tools/list',{}))).result.tools;expect(tools.map((t:any)=>t.name).sort()).toEqual(['mail_attachment_info','mail_batch_read','mail_list_folders','mail_read','mail_search','mail_status']);expect(tools.every((t:any)=>t.annotations.readOnlyHint)).toBe(true);
   const status=await asJson(await call('tools/call',{name:'mail_status',arguments:{}}));expect(status.result.content[0].text).toContain('MAIL_NOT_CONFIGURED');
   const invalid=await asJson(await call('tools/call',{name:'mail_read',arguments:{uid:0}}));expect(invalid.result.isError).toBe(true);
 });
 it('calls read through SDK using a fragmented IMAP server',async()=>{
   const f=fakeSocket();const mail=new MailService({QQ_MAIL_ADDRESS:'mail@example.com',QQ_MAIL_AUTH_CODE:'test'},()=>f.socket);
   const body={jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'mail_read',arguments:{uid:1,uidvalidity:77}}};
   const response=await handleMcp(req('/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify(body)}),mail,body);
   expect((await asJson(response)).result.content[0].text).toContain('你好，世界');expect(f.seen).toBe(false);expect(f.closed).toBe(true);
 });
});

describe('real Chromium OAuth consent navigation',()=>{
 for(const oldPolicy of [true,false]) it(oldPolicy?'reproduces opaque Origin from no-referrer form':'submits same-origin form with browser-managed cookie and completes PKCE',async()=>{
   const browser=await chromium.launch({proxy:{server:'http://127.0.0.1:9'},executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']});
   try {
     const context=await browser.newContext();const page=await context.newPage();
     const id=await register(),verifier=randomToken();let submittedOrigin:string|null=null,submittedStatus=0,callback='';
     page.on('request',r=>{if(r.url().startsWith(redirect)){callback=r.url();expect(r.method()).toBe('GET');expect(r.postData()).toBeNull();}});
     await page.route('**/*',async route=>{
       const r=route.request();
       if(r.url().startsWith(redirect)){callback=r.url();await route.fulfill({status:200,body:'Authorized'});return;}
       if(!r.url().startsWith(base+'/')){await route.abort();return;}
       const headers=await r.allHeaders();
       const response=await worker.fetch(new Request(r.url(),{method:r.method(),headers,body:r.postDataBuffer()??undefined}),env);
       if(r.method()==='POST'){submittedOrigin=headers.origin??null;submittedStatus=response.status;}
       const responseHeaders=Object.fromEntries(response.headers);
       if(oldPolicy&&r.method()==='GET'&&new URL(r.url()).pathname==='/authorize')responseHeaders['referrer-policy']='no-referrer';
       await route.fulfill({status:response.status,headers:responseHeaders,body:await response.text()});
     });
     const p=new URLSearchParams({client_id:id,redirect_uri:redirect,response_type:'code',scope:'mail:read',resource:base+'/mcp',code_challenge:await hash(verifier),code_challenge_method:'S256',state:'browser-test'});
     await page.goto(base+'/authorize?'+p);
     expect(await page.locator('button[value=allow]').textContent()).toBe('授权一年');
     const cookie=(await context.cookies()).find(c=>c.name==='__Host-qq-consent');
     expect(cookie).toMatchObject({httpOnly:true,secure:true,sameSite:'Lax',path:'/'});
     await page.locator('input[name=password]').fill(env.OWNER_PASSWORD);
     await Promise.all([oldPolicy?page.waitForURL(base+'/authorize'):page.waitForRequest(r=>r.url().startsWith(redirect)),page.locator('button[value=allow]').click()]);
     if(oldPolicy){expect(submittedOrigin).toBe('null');expect(submittedStatus).toBe(403);expect(await page.textContent('body')).toContain('ORIGIN_DENIED');}
     else {
       expect(submittedOrigin).toBe(base);expect(submittedStatus).toBe(303);
       const url=new URL(callback);expect(url.searchParams.get('state')).toBe('browser-test');expect(url.searchParams.get('iss')).toBe(base);
       expect((await exchange(id,verifier,url.searchParams.get('code')!)).status).toBe(200);
       expect((await context.cookies()).find(c=>c.name==='__Host-qq-consent')).toBeUndefined();
     }
   } finally {await browser.close();}
 });
 it('rejects absent, opaque and cross-origin submissions even with correct nonce, cookie and password',async()=>{
   const s=await start(await register(),randomToken());
   for(const origin of [undefined,'null','https://chatgpt.com','https://attacker.invalid']) {
     const headers:Record<string,string>={Cookie:s.cookie,Referer:base+'/authorize'};if(origin!==undefined)headers.Origin=origin;
     const r=await worker.fetch(req('/authorize',{method:'POST',headers,body:new URLSearchParams({nonce:s.nonce,password:env.OWNER_PASSWORD,decision:'allow'})}),env);
     expect(r.status).toBe(403);
   }
   expect((await consent(s)).status).toBe(303);
 });
});
