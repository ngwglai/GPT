import { it, expect } from 'vitest';
import { diagnosticEvent } from '../src/diagnostics';
const env={PUBLIC_ORIGIN:'https://mail-mcp.example.com'} as const;
it('records protocol facts without queries, headers, bodies, passwords or tokens',()=>{
 const request=new Request(env.PUBLIC_ORIGIN+'/register?token=PRIVATE_QUERY',{method:'POST',headers:{Authorization:'Bearer PRIVATE_TOKEN',Cookie:'PRIVATE_COOKIE',Origin:'https://PRIVATE_ORIGIN.invalid','Content-Type':'application/json','MCP-Protocol-Version':'PRIVATE_HEADER',Accept:'application/json'},body:'PRIVATE_BODY'});
 const result=diagnosticEvent(request,new Response(null,{status:503}),env,{reason:'owner_password_too_short'});
 expect(result).toMatchObject({path:'/register',status:503,reason:'owner_password_too_short',origin:'other',authorizationPresent:true,protocol:'other'});
 expect(JSON.stringify(result)).not.toContain('PRIVATE_');
});
it('does not log arbitrary path segments',()=>{
 const result=diagnosticEvent(new Request(env.PUBLIC_ORIGIN+'/PRIVATE_PATH'),new Response(),env,{});
 expect(result.path).toBe('other');expect(JSON.stringify(result)).not.toContain('PRIVATE_PATH');
});
