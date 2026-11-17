# RT-FE-REBUILD-DEBT-RETIREMENT-002 — Bundle, CDN & Style Debt Retirement

## 1. Runtime CDN Elimination
- Removed runtime `<link>` and `<script>` references to `fonts.googleapis.com`, `fonts.gstatic.com`, and `unpkg.com` from `index.html`.
- Bundled `leaflet` and `leaflet/dist/leaflet.css` locally inside `vendor-leaflet`.
- Configured local `@font-face` declarations for `Vazirmatn` in `src/styles/fonts.css`.

## 2. CSS Layer Discipline (`src/styles/` & `src/index.css`)
- Established `@layer reset, tokens, base, themes, layouts, components, utilities;`.
- Removed global `overflow: hidden` and `user-select: none` from `html, body`; scoped viewport locking exclusively to `.app-viewport-locked` (`MainLayout`).
- Reduced `!important` count in `src/index.css` from `78` to `0`.

## 3. Code-Splitting & Bundle Targets
- Converted `Stage34` through `Stage84` panels in `src/features/onboarding/components/OnboardingStageSwitch.tsx` to `React.lazy` + `Suspense`.
- Refined `manualChunks` in `vite.config.ts` to eliminate circular chunk warnings and ensure all non-map/non-vendor chunks remain `< 350 KB` raw (`index` bundle reduced from `598.74 KB` raw to `~202 KB` raw / `~58 KB` gzip).
