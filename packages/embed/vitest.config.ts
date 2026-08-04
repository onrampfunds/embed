import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    restoreMocks: true,
    // `restoreMocks` only unwinds vi.spyOn. Globals replaced with vi.stubGlobal need this, or
    // they leak into later tests and make failures depend on file order.
    unstubGlobals: true,
  },
});
