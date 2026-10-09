import { defineConfig } from 'vitest/config';

// PORT (default 3003) can be set in the environment. Loopback only: a laptop tool.
const port = Number(process.env.PORT ?? 3003);

export default defineConfig({
  server: { host: '127.0.0.1', port, strictPort: true },
  preview: { host: '127.0.0.1', port, strictPort: true },
  optimizeDeps: { include: ['cesium', 'egm96-universal'] }, // pre-bundle at start so the first page load doesn't reload
  test: { include: ['src/**/*.test.ts'] },
});
