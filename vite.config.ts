import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { livingPlanetGameServer } from './src/infrastructure/vite/livingPlanetPlugin';

// On WSL, projects under /mnt/<drive> sit on the Windows filesystem, where file-change
// events are unreliable. Polling keeps hot reload working there; elsewhere native watching is used.
const onWindowsDriveFromWsl = process.platform === 'linux' && process.cwd().startsWith('/mnt/');

export default defineConfig({
  plugins: [react(), livingPlanetGameServer()],
  server: {
    watch: onWindowsDriveFromWsl ? { usePolling: true, interval: 300 } : undefined,
  },
});
