import { defineConfig } from 'vite';
import {releasePlugin} from './scripts/release-plugin.mjs';

// A separate build keeps the normal same-origin deployment unchanged.
export default defineConfig({
  base: './',
  publicDir: 'public',
  build: { outDir: 'artifacts/itchio/build', emptyOutDir: true },
  define: { 'import.meta.env.VITE_WS_URL': JSON.stringify('') },
  plugins: [releasePlugin(),{
    name: 'itch-portable-assets',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/src/') || !id.endsWith('.js')) return;
      let result = code.replace(/(['"`])\/(models|motions|textures|basis)\//g, '$1./$2/');
      result = result.replace("const TILE_PREFIX = '/urban-tiles'", "const TILE_PREFIX = 'https://minogame.site/urban-tiles'");
      // Fast first launch; Hong Kong remains available in the city selector.
      if (id.endsWith('/CitySelection.js')) result = result.replace(
        ".get('city') === 'procedural' ? 'procedural' : 'hong-kong'",
        ".get('city') === 'hong-kong' ? 'hong-kong' : 'procedural'"
      );
      return { code: result, map: null };
    },
    transformIndexHtml(html) {
      return html.replace(/\s*<link rel="manifest"[^>]*>/, '')
        .replaceAll('href="?city=', 'href="index.html?city=')
        .replace(/<button class="mode-option"[^>]*data-mode="custom"[\s\S]*?<\/button>/, '')
        .replace('<option value="custom">사용자 설정 경기</option>', '');
    },
  }],
});
