import { diagnosticEvent, type Diagnostic } from './diagnostics';
import { connect } from 'cloudflare:sockets';
import { MailService } from './mail';
import { handleMcp } from './mcp';
import { authorized, oauth } from './oauth';
import { boundedBody, json } from './security';
import { errorCode } from './errors';
async function route(request:Request,env:Env,diagnostic:Diagnostic):Promise<Response> {
    try {
      const url=new URL(request.url);
      if(url.origin!==env.PUBLIC_ORIGIN)return json({error:'INVALID_HOST'},400);
      if(request.method==='GET'&&url.pathname==='/health')return json({status:'ok',service:'qq-mail-mcp',version:'1.0.0',readOnly:true});
      const origin=request.headers.get('origin');
      if(origin && origin!==env.PUBLIC_ORIGIN && origin!=='https://chatgpt.com')return json({error:'ORIGIN_DENIED'},403);
      if(!env.RATE_LIMITER)return json({error:'SERVICE_UNAVAILABLE'},503);
      const key=request.headers.get('CF-Connecting-IP')??'unknown';
      if(!(await env.RATE_LIMITER.limit({key:'ip:'+key})).success)return json({error:'RATE_LIMITED'},429,{'Retry-After':'60'});
      if(url.pathname==='/mcp') {
        if(!await authorized(request,env))return json({error:'UNAUTHORIZED'},401,{'WWW-Authenticate':`Bearer resource_metadata="${env.PUBLIC_ORIGIN}/.well-known/oauth-protected-resource", scope="mail:read"`});
        if(!(await env.RATE_LIMITER.limit({key:'mail:owner'})).success)return json({error:'RATE_LIMITED'},429);
        if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405,{Allow:'POST'});
        if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'INVALID_CONTENT_TYPE'},415);
        const body:unknown=JSON.parse(await boundedBody(request));
        if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'INVALID_REQUEST'},400);
        return await handleMcp(request,new MailService(env,()=>connect({hostname:'imap.qq.com',port:993},{secureTransport:'on',allowHalfOpen:false})),body);
      }
      return await oauth(request,env,diagnostic);
    } catch(e) {
      const code=errorCode(e);
      if(e instanceof SyntaxError)return json({error:'INVALID_REQUEST'},400);
      return json({error:code==='REQUEST_TOO_LARGE'?code:'SERVICE_UNAVAILABLE'},code==='REQUEST_TOO_LARGE'?413:503);
    }
}
export default {
  async fetch(request:Request,env:Env):Promise<Response> {
    const detail:Diagnostic={};
    const response=await route(request,env,detail);
    console.info(diagnosticEvent(request,response,env,detail));
    return response;
  }
} satisfies ExportedHandler<Env>;
