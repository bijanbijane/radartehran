import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import { resolveAllowedViteDevHosts } from './src/utils/serverConfigValidator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  let allowedHosts: string[] = ['localhost', '127.0.0.1'];
  try {
    allowedHosts = resolveAllowedViteDevHosts({ ...(typeof process !== 'undefined' && process.env ? process.env : {}), ...env });
  } catch {
    allowedHosts = ['localhost', '127.0.0.1'];
  }

  return {
    plugins: [react(), tailwindcss()],
    // Task 458: Never inject server-side GEMINI_API_KEY or other private credentials into frontend bundles.
    define: {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'lucide-react',
        'recharts',
        'd3-scale',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
      ],
    },
    build: {
      emptyOutDir: true,
      minify: 'esbuild',
      // Task 494: Do not publish public source maps in production build artifacts.
      sourcemap: false,
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@firebase/firestore') || id.includes('firebase/firestore')) {
                return 'vendor-firebase-firestore';
              }
              if (id.includes('firebase')) {
                return 'vendor-firebase-auth';
              }
              if (id.includes('recharts') || id.includes('d3-')) {
                return 'vendor-charts';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('react-dom') || id.includes('react')) {
                return 'vendor-react';
              }
            }
            if (
              id.includes('src/data/iranNorthWestEastHoods') ||
              id.includes('src/data/iranCentralSouthHoods') ||
              id.includes('src/data/metropolitanExtendedHoods') ||
              id.includes('src/data/iranProvincesDirectory')
            ) {
              return 'data-iran-provinces';
            }
            if (
              id.includes('src/data/neighborhoods') ||
              id.includes('src/data/multiCityData') ||
              id.includes('src/data/neighborhoodInsights') ||
              id.includes('src/data/tehranExtendedInsights') ||
              id.includes('src/data/provincialExtendedInsights') ||
              id.includes('src/data/tehranCityRemainingHoods') ||
              id.includes('src/data/tehranCountiesHoods')
            ) {
              return 'data-neighborhoods';
            }
            if (
              id.includes('src/components/views/') ||
              id.includes('src/components/modals/') ||
              id.includes('src/components/layout/')
            ) {
              return 'ui-product-views';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      // Task 448: Explicit allowedHosts list instead of unrestricted `allowedHosts: true`
      allowedHosts,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: [
          '**/.cache-data.json*',
          '**/.runtime-config.json*',
          '**/.osm-boundaries-cache.json*',
          '**/.object-storage-bucket/**',
        ],
      },
    },
  };
});