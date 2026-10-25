import { defineConfig } from 'vite';
import { releasePlugin } from './scripts/release-plugin.mjs';

export default defineConfig({
  base: './',
  publicDir: 'public',
  build: { outDir: 'artifacts/crazygames/build', emptyOutDir: true },
  define: { 'import.meta.env.VITE_WS_URL': JSON.stringify('') },
  plugins: [
    releasePlugin(),
    {
      name: 'crazygames-portable-assets',
      enforce: 'pre',
      transform(code, id) {
        if (!id.includes('/src/') || !id.endsWith('.js')) return;
        let result = code.replace(/(['"`])\/(models|motions|textures|basis)\//g, '$1./$2/');
        result = result.replace("const TILE_PREFIX = '/urban-tiles'", "const TILE_PREFIX = 'https://minogame.site/urban-tiles'");
        if (id.endsWith('/CitySelection.js')) {
          result = result.replace(
            ".get('city') === 'procedural' ? 'procedural' : 'hong-kong'",
            ".get('city') === 'hong-kong' ? 'hong-kong' : 'procedural'"
          );
        }
        return { code: result, map: null };
      },
      transformIndexHtml(html) {
        let modified = html
          .replace(/\s*<link rel="manifest"[^>]*>/, '')
          .replaceAll('href="?city=', 'href="index.html?city=')
          .replace(/<button class="mode-option"[^>]*data-mode="custom"[\s\S]*?<\/button>/, '')
          .replace('<option value="custom">사용자 설정 경기</option>', '');

        // Inject CrazyGames SDK v3 and lifecycle hook
        const sdkSnippet = `
    <!-- CrazyGames SDK v3 -->
    <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
    <script>
      (function() {
        window.__initCrazyGames = async function() {
          if (window.CrazyGames?.SDK) {
            try {
              await window.CrazyGames.SDK.init();
              console.log('[CrazyGames] SDK v3 initialized successfully');
            } catch (err) {
              console.warn('[CrazyGames] SDK init note:', err);
            }
          }
        };
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', window.__initCrazyGames);
        } else {
          window.__initCrazyGames();
        }
      })();
    </script>
        `;
        return modified.replace('</head>', `${sdkSnippet}\n</head>`);
      },
    },
  ],
});
