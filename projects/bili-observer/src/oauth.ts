import { createLocalJWKSet, jwtVerify } from 'jose';
import { boundedJson, type Fetcher } from './bilibili/client';
import { obj } from './bilibili/data';
import { secureEqual } from './security';

export type Access = { scopes: ReadonlySet<string>; oauth: boolean };
export const READ_SCOPE = 'bili:read';
export const WRITE_SCOPE = 'bili:write';
export type OAuthSettings = Partial<Pick<Env, 'OAUTH_ISSUER' | 'OAUTH_RESOURCE' | 'OAUTH_JWKS_URL' | 'OAUTH_ALLOWED_SUBJECT'>>;

function publicHttps(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port || url.hostname === 'localhost' || /^[\d.:\[\]]+$/.test(url.hostname)) throw Error('Invalid OAuth configuration');
  return value;
}
export function oauthConfig(env: OAuthSettings) {
  if (!env.OAUTH_ISSUER && !env.OAUTH_RESOURCE && !env.OAUTH_JWKS_URL) return null;
  if (!env.OAUTH_ISSUER || !env.OAUTH_RESOURCE || !env.OAUTH_JWKS_URL || !env.OAUTH_ALLOWED_SUBJECT) throw Error('Incomplete OAuth configuration');
  return { issuer: publicHttps(env.OAUTH_ISSUER), resource: publicHttps(env.OAUTH_RESOURCE), jwks: publicHttps(env.OAUTH_JWKS_URL), subject: env.OAUTH_ALLOWED_SUBJECT };
}
export function resourceMetadata(env: OAuthSettings) {
  const config = oauthConfig(env);
  if (!config) return null;
  return { resource: config.resource, authorization_servers: [config.issuer], scopes_supported: [READ_SCOPE, WRITE_SCOPE], bearer_methods_supported: ['header'] };
}
export function challenge(origin: string, scopes = [READ_SCOPE], error = 'invalid_token') {
  return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="${scopes.join(' ')}", error="${error}", error_description="Authorization required for this operation"`;
}
export async function verifyOAuth(token: string, env: OAuthSettings, fetcher: Fetcher = fetch): Promise<Access> {
  const config = oauthConfig(env);
  if (!config || token.length > 12000) throw Error('Invalid token');
  // JWKS is a configured public-key endpoint. No bearer token or Bili credentials leave this Worker.
  const response = await fetcher(config.jwks, { redirect: 'manual', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) { await response.body?.cancel(); throw Error('Key lookup failed'); }
  const keys = obj(await boundedJson(response, 64 * 1024));
  if (!Array.isArray(keys.keys) || keys.keys.length > 20) throw Error('Invalid keys');
  const jwks = createLocalJWKSet({ keys: keys.keys });
  const { payload } = await jwtVerify(token, jwks, {
    issuer: config.issuer, audience: config.resource, algorithms: ['RS256', 'ES256'],
    requiredClaims: ['iss', 'aud', 'sub', 'exp', 'iat'], clockTolerance: 5
  });
  // A valid token for a different person must never access this person's Bili account.
  if (payload.sub !== config.subject || !Number.isFinite(payload.exp) || typeof payload.scope !== 'string') throw Error('Invalid identity');
  const scopes = new Set(payload.scope.split(/\s+/).filter(Boolean));
  if (!scopes.has(READ_SCOPE)) throw Error('Insufficient scopes');
  return { scopes, oauth: true };
}
export async function authenticate(header: string | null, env: Env): Promise<Access | null> {
  const token = header?.match(/^Bearer (\S+)$/i)?.[1] ?? '';
  if (env.MCP_ACCESS_TOKEN?.length >= 32 && await secureEqual(token, env.MCP_ACCESS_TOKEN)) return { scopes: new Set([READ_SCOPE, WRITE_SCOPE]), oauth: false };
  if (!token) return null;
  try { return await verifyOAuth(token, env); } catch { return null; }
}
