import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so test runs never start the game server plugin.
// UI tests opt into jsdom per file with `// @vitest-environment jsdom`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
