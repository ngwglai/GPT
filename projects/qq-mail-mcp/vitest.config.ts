import { defineConfig } from 'vitest/config';
export default defineConfig({resolve:{alias:{'cloudflare:sockets':new URL('./test/socket-mock.ts',import.meta.url).pathname}},test:{testTimeout:15000,hookTimeout:30000,fileParallelism:false}});
