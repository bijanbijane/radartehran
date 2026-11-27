#!/usr/bin/env bash
set -euo pipefail

echo "[security-deps] npm ci"
npm ci --no-audit --no-fund

echo "[security-deps] npm audit"
npm audit --json > /tmp/radar-npm-audit.json || true
node -e "const a=require('/tmp/radar-npm-audit.json'); const v=a.metadata?.vulnerabilities ?? {}; console.log('NPM_AUDIT',JSON.stringify(v)); for (const [name,p] of Object.entries(a.vulnerabilities||{})) console.log('AUDIT_PACKAGE',name,p.severity,'direct='+p.isDirect,'fix='+JSON.stringify(p.fixAvailable)); const blocked=['vitest','@vitest/mocker','tinypool','sharp'].filter(name=>a.vulnerabilities?.[name]); if ((v.critical ?? 0)>0 || blocked.length) { console.error('SECURITY_AUDIT_GATE_FAILED',JSON.stringify({critical:v.critical ?? 0,blocked})); process.exit(1); }"

echo "[security-deps] typecheck"
npm run typecheck

echo "[security-deps] architecture"
npm run arch:check

echo "[security-deps] security tests"
npm run test:security

echo "[security-deps] auth tests"
npm run test:auth

echo "[security-deps] Cloudflare and D1 isolation tests"
npm run test:cloudflare

echo "[security-deps] D1 triad tests"
npx tsx --test tests/rt-db-triad-001.test.ts tests/rt-db-triad-002-forensic.test.ts

echo "[security-deps] storage tests"
npm run test:storage

echo "[security-deps] Node unit tests"
npm run test:unit

echo "[security-deps] Vitest tests"
npm run test:vitest

echo "[security-deps] frontend build"
npm run build

echo "[security-deps] verification commands completed; review residual npm audit findings printed above"
