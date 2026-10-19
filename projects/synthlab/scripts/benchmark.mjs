import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { preset } = await server.ssrLoadModule('/src/core/cases.ts');
  const { runExperiment } = await server.ssrLoadModule('/src/core/engine.ts');
  for (const name of ['Max2', 'Abs', 'Clamp', 'Sign']) {
    const result = await runExperiment(preset(name));
    console.log(JSON.stringify({ case: name, status: result.status, ...result.stats, rounds: result.iterations.length, finalSize: result.iterations.at(-1)?.size, checked: result.verification?.checked, expressions: result.iterations.map(i => i.expression) }));
    if (result.status !== 'verified') process.exitCode = 1;
  }
} finally { await server.close(); }
