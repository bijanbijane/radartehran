import { readFileSync } from 'node:fs';

let firebaseConfig = {};
try {
  firebaseConfig = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
} catch {
  // The build remains fail-closed below when neither supported source exists.
}

const raw = String(
  process.env.VITE_FIREBASE_APP_CHECK_SITE_KEY ||
  process.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY ||
  firebaseConfig.recaptchaSiteKey ||
  '',
).trim();

if (
  !raw ||
  raw.length < 10 ||
  /^(MY_|YOUR_|PLACEHOLDER|UNDEFINED|NULL|TODO)/i.test(raw)
) {
  console.error(
    'Missing valid VITE_FIREBASE_APP_CHECK_SITE_KEY; refusing production frontend deployment.',
  );
  process.exit(1);
}

console.log('Production Firebase App Check site key is configured.');
