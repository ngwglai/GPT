import type { Diagnostic } from './diagnostics';
import { z } from 'zod';
import { boundedBody, equal, escapeHtml, hash, json, randomToken } from './security';
export type AuthEnv=Pick<Env,'AUTH_DB'|'OWNER_PASSWORD'|'PUBLIC_ORIGIN'|'OAUTH_REDIRECT_URIS'>;
interface Grant {hash:string;kind:string;client_id:string;redirect_uri:string;challenge:string;resource:string;state:string;expires:number;}
const now=()=>Math.floor(Date.now()/1000);
const err=(code='invalid_request',status=400)=>json({error:code},status);
const csrfCookie='__Host-qq-consent';
function redirects(env:AuthEnv):string[]{return env.OAUTH_REDIRECT_URIS.split(',').map(s=>s.trim()).filter(s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash;}catch{return false;}});}
export function metadata(env:AuthEnv,protectedResource=false) {
  const origin=env.PUBLIC_ORIGIN;
  return protectedResource?{resource:origin+'/mcp',authorization_servers:[origin],scopes_supported:['mail:read'],bearer_methods_supported:['header']}:
    {issuer:origin,authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',registration_endpoint:origin+'/register',revocation_endpoint:origin+'/revoke',response_types_supported:['code'],grant_types_supported:['authorization_code'],token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],scopes_supported:['mail:read'],authorization_response_iss_parameter_supported:true};
}
async function saveGrant(env:AuthEnv,token:string,kind:string,g:Omit<Grant,'hash'|'kind'|'expires'>,ttl:number) {
  await env.AUTH_DB.prepare('INSERT INTO oauth_grants(hash,kind,client_id,redirect_uri,challenge,resource,state,expires) VALUES(?,?,?,?,?,?,?,?)').bind(await hash(token),kind,g.client_id,g.redirect_uri,g.challenge,g.resource,g.state,now()+ttl).run();
}
export async function authorized(request:Request,env:AuthEnv):Promise<boolean> {
  if(!env.OWNER_PASSWORD||env.OWNER_PASSWORD.length<32) return false;
  const header=request.headers.get('authorization')??'';
  if(!/^Bearer [A-Za-z0-9_-]{43}$/i.test(header)) return false;
  const token=await env.AUTH_DB.prepare("SELECT resource FROM oauth_grants WHERE hash=? AND kind='access' AND expires>?").bind(await hash(header.slice(7)),now()).first<{resource:string}>();
  return token?.resource===env.PUBLIC_ORIGIN+'/mcp';
}
export async function oauth(request:Request,env:AuthEnv,diagnostic:Diagnostic={}):Promise<Response> {
  const url=new URL(request.url); const path=url.pathname;
  if(request.method==='GET' && (path==='/.well-known/oauth-protected-resource'||path==='/.well-known/oauth-protected-resource/mcp')) return json(metadata(env,true));
  if(request.method==='GET' && path==='/.well-known/oauth-authorization-server') return json(metadata(env));
  if(!env.OWNER_PASSWORD||env.OWNER_PASSWORD.length<32) {diagnostic.reason=env.OWNER_PASSWORD?'owner_password_too_short':'owner_password_missing';return err('temporarily_unavailable',503);}
  if(path==='/register'&&request.method==='POST') {
    const schema=z.object({redirect_uris:z.array(z.string().max(512)).min(1).max(4),token_endpoint_auth_method:z.literal('none').optional(),grant_types:z.array(z.enum(['authorization_code','refresh_token'])).min(1).max(2).refine(types=>types.includes('authorization_code')).optional(),response_types:z.array(z.literal('code')).optional(),client_name:z.string().max(100).optional(),scope:z.literal('mail:read').optional()});
    const raw:unknown=JSON.parse(await boundedBody(request));
    const grants=raw&&typeof raw==='object'&&'grant_types' in raw?raw.grant_types:undefined;
    diagnostic.requestedGrants=grants===undefined?['absent']:Array.isArray(grants)?[...new Set(grants.slice(0,8).map(g=>g==='authorization_code'?'authorization_code':g==='refresh_token'?'refresh_token':'other'))]:['invalid_type'];
    const input=schema.safeParse(raw);
    if(!input.success) {diagnostic.reason='invalid_client_metadata';const known=new Set(['redirect_uris','token_endpoint_auth_method','grant_types','response_types','client_name','scope']);diagnostic.invalidFields=[...new Set(input.error.issues.map(i=>String(i.path[0])).map(k=>known.has(k)?k:'other'))];return err('invalid_client_metadata');}
    if(!input.data.redirect_uris.every(u=>redirects(env).includes(u))) {diagnostic.reason='invalid_redirect_uri';return err('invalid_redirect_uri');}
    const clientId=randomToken();
    // Bound unauthenticated registration storage. Client records never expire behind ChatGPT's back.
    const inserted=await env.AUTH_DB.prepare('INSERT INTO oauth_clients(id,redirect_uris) SELECT ?,? WHERE (SELECT COUNT(*) FROM oauth_clients)<100').bind(clientId,JSON.stringify(input.data.redirect_uris)).run();
    if(!inserted.meta.changes) return err('temporarily_unavailable',503);
    // RFC 7591 section 3.2.1 permits substituting requested metadata.
    // Register only implemented grants; requesting refresh does not enable refresh tokens.
    return json({client_id:clientId,redirect_uris:input.data.redirect_uris,token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code'],scope:'mail:read'},201);
  }
  if(path==='/authorize'&&request.method==='GET') {
    const p=url.searchParams;
    if(['client_id','redirect_uri','response_type','resource','code_challenge','code_challenge_method','scope','state'].some(k=>p.getAll(k).length>1)) return err();
    const clientId=p.get('client_id')??'',redirect=p.get('redirect_uri')??'',challenge=p.get('code_challenge')??'',state=p.get('state')??'';
    if(clientId.length>128||state.length>512||p.get('response_type')!=='code'||p.get('scope')!=='mail:read'||p.get('resource')!==env.PUBLIC_ORIGIN+'/mcp'||p.get('code_challenge_method')!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(challenge)) return err();
    const client=await env.AUTH_DB.prepare('SELECT redirect_uris FROM oauth_clients WHERE id=?').bind(clientId).first<{redirect_uris:string}>();
    if(!client||!redirects(env).includes(redirect)||!JSON.parse(client.redirect_uris).includes(redirect)) return err('invalid_client');
    // Browsers enforce form-action on redirects too. Only the validated callback is added.
    const callbackUrl=new URL(redirect);
    const callbackSource=callbackUrl.origin+callbackUrl.pathname.replace(/[;'"]/g,c=>'%'+c.charCodeAt(0).toString(16));
    const nonce=randomToken();
    await env.AUTH_DB.prepare('DELETE FROM oauth_grants WHERE expires<=?').bind(now()).run();
    await saveGrant(env,nonce,'consent',{client_id:clientId,redirect_uri:redirect,challenge,resource:env.PUBLIC_ORIGIN+'/mcp',state},300);
    const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>QQ Mail 私人授权</title><h1>授权只读访问 QQ 邮箱</h1><p>允许此客户端搜索和读取邮件，包括正文和附件名称。邮件内容将返回到发起连接的 ChatGPT 会话。不会发送、删除邮件或改变已读状态。</p><p>回调地址：${escapeHtml(redirect)}</p><p>请输入你在 Cloudflare Secret 中设置的 OWNER_PASSWORD（不是 QQ 邮箱授权码）。</p><form method="post" action="/authorize"><input type="hidden" name="nonce" value="${nonce}"><label>私人访问密码 <input name="password" type="password" required autocomplete="current-password" maxlength="256"></label><button type="submit" name="decision" value="allow">授权一小时</button><button type="submit" name="decision" value="deny" formnovalidate>取消</button></form></html>`;
    return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':`default-src 'none'; form-action 'self' ${callbackSource}; frame-ancestors 'none'; base-uri 'none'`,'Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Set-Cookie':`${csrfCookie}=${nonce}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300`}});
  }
  if(path==='/authorize'&&request.method==='POST') {
    if(request.headers.get('origin')!==env.PUBLIC_ORIGIN) return err('access_denied',403);
    const p=new URLSearchParams(await boundedBody(request));
    if(['nonce','password','decision'].some(k=>p.getAll(k).length>1)) return err();
    const nonce=p.get('nonce')??'';const cookie=(request.headers.get('cookie')??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(csrfCookie+'='))?.slice(csrfCookie.length+1)??'';
    if(!/^[A-Za-z0-9_-]{43}$/.test(nonce)||!await equal(nonce,cookie)) return err('access_denied',403);
    const decision=p.get('decision');if(!['allow','deny'].includes(decision??''))return err();
    if(decision==='allow'&&!await equal(p.get('password')??'',env.OWNER_PASSWORD)) return err('access_denied',403);
    // Atomic consumption prevents parallel code issuance and replay across isolates.
    const grant=await env.AUTH_DB.prepare("DELETE FROM oauth_grants WHERE hash=? AND kind='consent' AND expires>? RETURNING *").bind(await hash(nonce),now()).first<Grant>();
    if(!grant) return err('access_denied',403);
    const callback=new URL(grant.redirect_uri);callback.searchParams.set('state',grant.state);callback.searchParams.set('iss',env.PUBLIC_ORIGIN);
    if(decision==='deny') callback.searchParams.set('error','access_denied');
    else {const code=randomToken();await saveGrant(env,code,'code',grant,120);callback.searchParams.set('code',code);}
    return new Response(null,{status:303,headers:{Location:callback.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':`${csrfCookie}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`}});
  }
  if(path==='/token'&&request.method==='POST') {
    const p=new URLSearchParams(await boundedBody(request));
    if(['grant_type','code','client_id','redirect_uri','code_verifier','resource'].some(k=>p.getAll(k).length!==1)) return err();
    if(p.get('grant_type')!=='authorization_code') return err('unsupported_grant_type');
    const verifier=p.get('code_verifier')??'',code=p.get('code')??'';
    if(!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||!/^[A-Za-z0-9_-]{43}$/.test(code)||p.get('resource')!==env.PUBLIC_ORIGIN+'/mcp')return err('invalid_grant');
    // Validate binding AND consume in one SQL statement; a wrong verifier cannot burn a valid code.
    const grant=await env.AUTH_DB.prepare("DELETE FROM oauth_grants WHERE hash=? AND kind='code' AND expires>? AND client_id=? AND redirect_uri=? AND challenge=? AND resource=? RETURNING *").bind(await hash(code),now(),p.get('client_id'),p.get('redirect_uri'),await hash(verifier),p.get('resource')).first<Grant>();
    if(!grant)return err('invalid_grant');
    const token=randomToken();await saveGrant(env,token,'access',grant,31536000);
    return json({access_token:token,token_type:'Bearer',expires_in:31536000,scope:'mail:read',resource:grant.resource});
  }
  if(path==='/revoke'&&request.method==='POST') {
    const p=new URLSearchParams(await boundedBody(request));const token=p.get('token')??'';
    if(token.length<=128) await env.AUTH_DB.prepare("DELETE FROM oauth_grants WHERE hash=? AND kind='access'").bind(await hash(token)).run();
    return json({});
  }
  return err('invalid_request',404);
}
