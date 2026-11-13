// Read-only smoke tests with the official MCP v1 client against a remote or local Worker.
// No comments are ever posted by this script.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFileSync } from 'node:fs';
const endpoint = process.env.MCP_URL;
let token = process.env.MCP_ACCESS_TOKEN;
if (!token && process.env.MCP_TOKEN_FILE) token = readFileSync(process.env.MCP_TOKEN_FILE, 'utf8').trim();
if (!endpoint || !token) throw Error('Set MCP_URL and MCP_ACCESS_TOKEN (or MCP_TOKEN_FILE).');
const client = new Client({ name: 'bili-observer-smoke', version: '0.1.0' });
const transport = new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
const results = [];
try {
  const unauthorized = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  results.push({ name: 'unauthorized', ok: unauthorized.status === 401, status: unauthorized.status });
  await client.connect(transport);
  const list = await client.listTools();
  results.push({ name: 'tools/list', ok: list.tools.length === 9, count: list.tools.length, tools: list.tools.map(t => ({ name: t.name, readOnlyHint: t.annotations?.readOnlyHint })) });
  async function call(name, args) {
    await new Promise(resolve => setTimeout(resolve, 1100));
    const result = await client.callTool({ name, arguments: args });
    const body = result.structuredContent ?? JSON.parse(result.content[0].text);
    const data = body.data;
    results.push({ name, ok: body.ok, ...(body.error ? { error: body.error } : {}), ...(data ? { status: data.status, count: data.items?.length ?? data.segments?.length, total: data.total, available_subtitles: data.available_subtitles?.map(t => ({ language: t.language, available: t.available })) } : {}) });
    return data;
  }
  await call('search_videos', { keyword: 'Python', page_size: 2 });
  await call('get_video_info', { video_id: 'BV17x411w7KC' });
  await call('get_subtitle', { video_id: process.env.SUBTITLE_VIDEO ?? 'BV17x411w7KC', limit: 10 });
  await call('get_user_info', { mid: '2' });
  await call('get_user_videos', { mid: '2', page_size: 2 });
  const comments = await call('get_comments', { video_id: '2', page_size: 2 });
  if (comments?.items?.[0]?.comment_id) await call('get_comment_replies', { video_id: '2', root_id: comments.items[0].comment_id, page_size: 2 });
  // Validate error handling through the real MCP client, with no network side effect.
  const bad = await client.callTool({ name: 'get_comments', arguments: { video_id: '2', page_size: 1000 } });
  results.push({ name: 'invalid_parameters', ok: bad.isError === true });
} finally {
  await client.close();
  console.log(JSON.stringify(results, null, 2));
  if (results.some(result => result.ok !== true)) process.exitCode = 1;
}
