/** Closed vocabulary only. Never log URL queries, request bodies, credentials or mail. */
export interface Diagnostic {
  reason?: 'owner_password_missing'|'owner_password_too_short'|'invalid_client_metadata'|'invalid_redirect_uri';
  invalidFields?: string[];
  requestedGrants?: string[];
}
const paths=new Set(['/health','/mcp','/register','/authorize','/token','/revoke','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp','/.well-known/oauth-authorization-server']);
export function diagnosticEvent(request:Request,response:Response,env:Pick<Env,'PUBLIC_ORIGIN'>,detail:Diagnostic) {
  const origin=request.headers.get('origin');const path=new URL(request.url).pathname;
  const accept=request.headers.get('accept')??'';
  const protocol=request.headers.get('mcp-protocol-version');
  return {event:'mcp_http',path:paths.has(path)?path:'other',method:['GET','POST','OPTIONS','DELETE','HEAD'].includes(request.method)?request.method:'other',status:response.status,
    origin:origin===null?'absent':origin==='null'?'opaque':origin===env.PUBLIC_ORIGIN?'self':origin==='https://chatgpt.com'?'chatgpt':'other',
    authorizationPresent:request.headers.has('authorization'),acceptJson:accept.includes('application/json'),acceptSse:accept.includes('text/event-stream'),
    jsonContentType:request.headers.get('content-type')?.toLowerCase().includes('application/json')??false,
    protocol:protocol===null?'absent':['2024-11-05','2025-03-26','2025-06-18','2025-11-25','2026-07-28'].includes(protocol)?protocol:'other',...detail};
}
