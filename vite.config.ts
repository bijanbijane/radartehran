import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv, type PluginOption } from 'vite';
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

  const enableCloudflareVitePlugin =
    mode === 'cloudflare' ||
    env.CLOUDFLARE_VITE === '1' ||
    (typeof process !== 'undefined' && process.env?.CLOUDFLARE_VITE === '1');

  const plugins: PluginOption[] = [
    react(),
    tailwindcss(),
    ...(enableCloudflareVitePlugin ? [cloudflare({ configPath: './wrangler.jsonc' })] : []),
  ];

  return {
    plugins,
    // Task 458: Never inject server-side GEMINI_API_KEY or other private credentials into frontend bundles.
    define: {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      dedupe: [
        'react',
        'react-dom',
        // Firebase packages must share one @firebase/app component registry in Vite dev/E2E.
        // Different nested @firebase/app copies can register Firestore on a different provider
        // container, causing `Service firestore is not available` during application bootstrap.
        'firebase',
        '@firebase/app',
        '@firebase/auth',
        '@firebase/firestore',
        '@firebase/component',
        '@firebase/util',
      ],
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
      chunkSizeWarningLimit: 700,
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
              if (id.includes('d3-')) {
                return 'vendor-d3';
              }
              if (id.includes('recharts') || id.includes('victory-vendor')) {
                return 'vendor-charts';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('react-dom') || id.includes('react')) {
                return 'vendor-react';
              }
              if (id.includes('leaflet')) {
                return 'vendor-leaflet';
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
              id.includes('src/data/tehranExtendedInsights') ||
              id.includes('src/data/provincialExtendedInsights') ||
              id.includes('src/data/tehranCityRemainingHoods') ||
              id.includes('src/data/tehranCountiesHoods')
            ) {
              return 'data-extended-insights';
            }
            if (
              id.includes('src/data/neighborhoods') ||
              id.includes('src/data/multiCityData') ||
              id.includes('src/data/neighborhoodInsights') ||
              id.includes('src/data/realMarketPriceAggregator') ||
              id.includes('src/data/hedonicPricingEngine')
            ) {
              return 'data-neighborhoods';
            }
            if (id.includes('src/cells/')) {
              return 'engine-decision-cells';
            }
            if (
              id.includes('vite/preload-helper') ||
              id.includes('src/firebase') ||
              id.includes('src/context/') ||
              (id.includes('src/utils/') && !id.includes('src/utils/casper/')) ||
              id.includes('src/navigation/') ||
              id.includes('src/features/account/services/accountStorageScope') ||
              id.includes('src/features/account/services/accountSettingsStorageService') ||
              id.includes('src/components/ui/') ||
              id.includes('src/components/useEvaluatedNeighborhoods') ||
              id.includes('src/components/SearchHistory') ||
              id.includes('src/components/mapAdvancedLayers')
            ) {
              return 'app-core-shared';
            }
            if (id.includes('src/features/onboarding/components/')) {
              if (/Stage3\d/.test(id)) return 'onboarding-ui-34-39';
              if (/Stage4[0-4]/.test(id)) return 'onboarding-ui-40-44';
              if (/Stage4[5-9]/.test(id)) return 'onboarding-ui-45-49';
              if (/Stage5[0-4]/.test(id)) return 'onboarding-ui-50-54';
              if (/Stage5[5-9]/.test(id)) return 'onboarding-ui-55-59';
              if (/Stage6\d/.test(id)) return 'onboarding-ui-60-69';
              if (/Stage7\d/.test(id)) return 'onboarding-ui-70-79';
              if (/Stage8\d/.test(id)) return 'onboarding-ui-80-84';
              return 'onboarding-ui-core';
            }
            if (id.includes('src/features/onboarding/services/')) {
              if (/stage[345]\d|[Cc]ompar|[Ww]orkspace|[Vv]erif|[Mm]arket|[Dd]ecision|[Gg]eospatial/.test(id)) {
                return 'onboarding-svc-34-59';
              }
              if (/stage6\d|Stage6\d|urban[A-LN-Z]/.test(id)) {
                return 'onboarding-svc-60-69';
              }
              if (/stage[78]\d|Stage[78]\d|urbanM/.test(id)) {
                return 'onboarding-svc-70-84';
              }
              return 'onboarding-svc-core';
            }
            if (id.includes('src/features/properties/')) {
              return 'feature-properties';
            }
            if (id.includes('src/features/home/')) {
              return 'feature-home';
            }
            if (id.includes('src/features/market/')) {
              return 'feature-market';
            }
            if (id.includes('src/features/valuation/')) {
              return 'feature-valuation';
            }
            if (id.includes('src/features/admin/')) {
              return 'feature-admin';
            }
            if (id.includes('src/features/community/')) {
              return 'feature-community';
            }
            if (id.includes('src/features/communications/')) {
              return 'feature-communications';
            }
            if (id.includes('src/features/services/')) {
              return 'feature-services';
            }
            if (
              id.includes('src/features/account/') &&
              !id.includes('accountStorageScope') &&
              !id.includes('accountSettingsStorageService')
            ) {
              return 'feature-account';
            }
            if (id.includes('src/features/search/') || id.includes('src/features/discovery/')) {
              return 'feature-search-discovery';
            }
            if (id.includes('src/features/knowledge/')) {
              return 'feature-knowledge';
            }
            if (id.includes('src/features/data-governance/') || id.includes('src/features/analytics/')) {
              return 'feature-analytics-governance';
            }
            if (id.includes('src/components/stage2/')) {
              return 'ui-stage2';
            }
            if (
              id.includes('src/components/SuperModules') ||
              id.includes('src/components/EnterpriseAssetFund') ||
              id.includes('src/components/AgencyCrm')
            ) {
              return 'ui-supermodules';
            }
            if (id.includes('src/components/inspector/')) {
              return 'ui-inspector';
            }
            if (id.includes('src/components/casper/') || id.includes('src/components/modals/')) {
              return 'ui-modals-casper';
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