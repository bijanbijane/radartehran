#!/usr/bin/env node
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function normalizeAssetPath(value) {
  return value.replaceAll('\\\\', '/').replace(/^\\/+/, '');
}

export function collectInitialAssetFiles(manifest, entryKeys) {
  const visited = new Set();
  const js = new Set();
  const css = new Set();

  function visit(key) {
    if (visited.has(key)) return;
    const chunk = manifest[key];
    if (!chunk || typeof chunk !== 'object' || typeof chunk.file !== 'string') {
      throw new Error(`Vite manifest import is missing or malformed: ${key}`);
    }
    visited.add(key);

    const file = normalizeAssetPath(chunk.file);
    if (/\\.m?js$/i.test(file)) js.add(file);
    if (/\\.css$/i.test(file)) css.add(file);

    for (const stylesheet of chunk.css ?? []) {
      if (typeof stylesheet !== 'string') throw new Error(`Invalid CSS asset in manifest entry: ${key}`);
      css.add(normalizeAssetPath(stylesheet));
    }

    // Static imports are part of the initial dependency graph. Dynamic imports
    // are intentionally excluded because they are loaded only after navigation.
    for (const importedKey of chunk.imports ?? []) visit(importedKey);
  }

  for (const entryKey of entryKeys) visit(entryKey);
  return { js: [...js].sort(), css: [...css].sort() };
}

async function measureFiles(files, outDir) {
  const root = path.resolve(outDir);
  const results = [];
  for (const file of files) {
    const absolute = path.resolve(root, file);
    const relative = path.relative(root, absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Manifest asset escapes build output directory: ${file}`);
    }
    const bytes = await readFile(absolute);
    results.push({
      file,
      rawBytes: bytes.byteLength,
      gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
      brotliBytes: brotliCompressSync(bytes, {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
      }).byteLength,
    });
  }
  return results;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + row[key], 0);
}

export async function createBundleReport({ manifestPath, outDir }) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const entries = Object.entries(manifest)
    .filter(([, chunk]) => chunk?.isEntry === true)
    .map(([key]) => key)
    .sort();

  if (entries.length === 0) throw new Error('Vite manifest contains no isEntry=true chunks.');

  const files = collectInitialAssetFiles(manifest, entries);
  const [js, css] = await Promise.all([
    measureFiles(files.js, outDir),
    measureFiles(files.css, outDir),
  ]);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    measurement: 'local production build artifact sizes; gzip/Brotli are estimates, not observed edge wire sizes',
    entries,
    initial: {
      js: {
        fileCount: js.length,
        rawBytes: sum(js, 'rawBytes'),
        gzipBytes: sum(js, 'gzipBytes'),
        brotliBytes: sum(js, 'brotliBytes'),
        files: js,
      },
      css: {
        fileCount: css.length,
        rawBytes: sum(css, 'rawBytes'),
        gzipBytes: sum(css, 'gzipBytes'),
        brotliBytes: sum(css, 'brotliBytes'),
        files: css,
      },
    },
    excludedFromInitialTransfer: 'Vite dynamicImports and assets reachable only through dynamic imports',
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    args[key.slice(2)] = value;
    i += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = args.manifest ?? 'dist/.vite/manifest.json';
  const outDir = args['out-dir'] ?? 'dist';
  const report = await createBundleReport({ manifestPath, outDir });
  const maxInitialJsGzipKb = Number(args['max-initial-js-gzip-kb'] ?? process.env.RADAR_MAX_INITIAL_JS_GZIP_KB ?? 0);

  console.log('Initial frontend bundle report (static import closure only)');
  console.log(`JS: ${(report.initial.js.rawBytes / 1024).toFixed(1)} KiB raw, ${(report.initial.js.gzipBytes / 1024).toFixed(1)} KiB gzip estimate, ${(report.initial.js.brotliBytes / 1024).toFixed(1)} KiB Brotli estimate across ${report.initial.js.fileCount} files`);
  console.log(`CSS: ${(report.initial.css.rawBytes / 1024).toFixed(1)} KiB raw, ${(report.initial.css.gzipBytes / 1024).toFixed(1)} KiB gzip estimate across ${report.initial.css.fileCount} files`);
  console.log(`Static entry points: ${report.entries.join(', ')}`);

  if (args.report) {
    await writeFile(args.report, `${JSON.stringify(report, null, 2)}\\n`, 'utf8');
  }

  if (Number.isFinite(maxInitialJsGzipKb) && maxInitialJsGzipKb > 0) {
    const actualKb = report.initial.js.gzipBytes / 1024;
    if (actualKb > maxInitialJsGzipKb) {
      throw new Error(`Initial JS gzip estimate ${actualKb.toFixed(1)} KiB exceeds budget ${maxInitialJsGzipKb} KiB.`);
    }
    console.log(`Budget passed: ${actualKb.toFixed(1)} / ${maxInitialJsGzipKb} KiB gzip estimate.`);
  } else {
    console.log('Budget status: REPORT_ONLY (no measured baseline threshold has been approved yet).');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
