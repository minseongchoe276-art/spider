import { defineConfig } from 'vite';
import { attachRooms } from './scripts/rooms.mjs';

const urbanTilesProxy = {
  '/urban-tiles': {
    target: 'https://data.map.gov.hk',
    changeOrigin: true,
    secure: true,
    rewrite: (path) => path.replace(/^\/urban-tiles/, ''),
  },
};

export default defineConfig({
  plugins: [{ name: 'game-rooms', configureServer(server) { attachRooms(server.httpServer); } }],
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false,
    // The official Hong Kong 3D Tiles endpoint does not currently expose
    // browser CORS headers. Proxy only these read-only tile requests during
    // local development; the upstream data is not copied into the project.
    proxy: urbanTilesProxy,
  },
  // npm run preview must serve the same same-origin proxy as local development.
  preview: { host: '127.0.0.1', proxy: urbanTilesProxy },
  publicDir: 'public'
});
