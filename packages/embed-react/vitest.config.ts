import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // JSX is handled by the transformer's own defaults plus `"jsx": "react-jsx"` in tsconfig.
  // Setting an `esbuild` block here is ignored by vitest 4 (it uses oxc) and only produces a
  // warning suggesting it does something.
  resolve: {
    alias: {
      // Resolved to the core's source rather than its build output, so the wrapper's tests do not
      // depend on build ordering. The real package wiring is still exercised — `npm run build`
      // and `tsc --noEmit` both resolve through the published entrypoints.
      '@onrampfunds/embed': path.resolve(here, '../embed/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.tsx'],
    setupFiles: ['./test/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
