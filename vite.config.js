import { defineConfig } from 'vite';
import { attachRooms } from './scripts/rooms.mjs';
import {releasePlugin} from './scripts/release-plugin.mjs';

const urbanTilesProxy = {
  '/urban-tiles': {
    target: 'https://data.map.gov.hk',
    changeOrigin: true,
    secure: true,
    rewrite: (path) => path.replace(/^\/urban-tiles/, ''),
    configure(proxy) {
      proxy.on('proxyRes', (res, req) => {
        if (res.statusCode === 200) res.headers['cache-control'] =
          req.url?.split('?')[0].endsWith('.json') ? 'public, max-age=300' : 'public, max-age=86400';
      });
    },
  },
};

export default defineConfig({
  plugins: [releasePlugin(),{
    name: 'game-rooms',
    configureServer(server) { attachRooms(server.httpServer); },
    configurePreviewServer(server) { attachRooms(server.httpServer); },
  }],
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
