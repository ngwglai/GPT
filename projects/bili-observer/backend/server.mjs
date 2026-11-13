import { createServer } from 'node:http';
import { handleBackend } from './handler.mjs';
const secret = process.env.BILI_BACKEND_TOKEN;
if (!secret || secret.length < 32) throw Error('Set BILI_BACKEND_TOKEN with at least 32 random characters.');
let active = false;
createServer(async (incoming, outgoing) => {
  // Single in-flight operation. Reject concurrency; never queue or retry writes.
  if (active) { outgoing.writeHead(429); outgoing.end(); return; }
  active = true;
  const deadline = setTimeout(() => incoming.destroy(), 15000);
  try {
    const chunks = []; let length = 0;
    for await (const chunk of incoming) {
      length += chunk.length;
      if (length > 32768) { outgoing.writeHead(413); outgoing.end(); return; }
      chunks.push(chunk);
    }
    const request = new Request(`http://localhost${incoming.url}`, { method: incoming.method, headers: incoming.headers, ...(incoming.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) });
    const response = await handleBackend(request, secret);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) { if (!outgoing.write(chunk)) await new Promise(resolve => outgoing.once('drain', resolve)); }
    outgoing.end();
  } catch { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); }
  finally { clearTimeout(deadline); active = false; }
}).listen(Number(process.env.BILI_BACKEND_PORT ?? 8788), '127.0.0.1', () => console.log('Bili backend ready on loopback. No requests or credentials are logged.'));
