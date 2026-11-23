import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectInitialAssetFiles, createBundleReport } from '../scripts/performance/check-vite-bundle-budget.mjs';

const manifest = {
  'index.html': {
    file: 'assets/index.js',
    isEntry: true,
    imports: ['chunks/vendor.js'],
    dynamicImports: ['pages/market.js'],
    css: ['assets/index.css'],
  },
  'chunks/vendor.js': {
    file: 'assets/vendor.js',
  },
  'pages/market.js': {
    file: 'assets/market.js',
    css: ['assets/market.css'],
  },
};

test('initial asset graph follows static imports but excludes dynamic imports', () => {
  assert.deepEqual(
    collectInitialAssetFiles(manifest, ['index.html']),
    {
      js: ['assets/index.js', 'assets/vendor.js'],
      css: ['assets/index.css'],
    },
  );
});

test('shared static imports are counted once across multiple entry points', () => {
  const multiEntryManifest = {
    ...manifest,
    'admin.html': {
      file: 'assets/admin.js',
      isEntry: true,
      imports: ['chunks/vendor.js'],
    },
  };

  assert.deepEqual(
    collectInitialAssetFiles(multiEntryManifest, ['index.html', 'admin.html']).js,
    ['assets/admin.js', 'assets/index.js', 'assets/vendor.js'],
  );
});

test('bundle report measures raw, gzip and Brotli bytes for initial JS and CSS', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'radar-bundle-budget-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await mkdir(path.join(root, 'chunks'), { recursive: true });
  await writeFile(path.join(root, 'assets/index.js'), 'console.log("radar");');
  await writeFile(path.join(root, 'assets/vendor.js'), 'export const value = 1;');
  await writeFile(path.join(root, 'assets/index.css'), 'body { margin: 0; }');
  await writeFile(path.join(root, 'assets/market.js'), 'console.log("lazy");');
  await writeFile(path.join(root, 'assets/market.css'), '.lazy { display: block; }');

  const manifestPath = path.join(root, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest));

  const report = await createBundleReport({ manifestPath, outDir: root });
  assert.equal(report.initial.js.fileCount, 2);
  assert.equal(report.initial.css.fileCount, 1);
  assert.ok(report.initial.js.rawBytes > 0);
  assert.ok(report.initial.js.gzipBytes > 0);
  assert.ok(report.initial.js.brotliBytes > 0);
  assert.equal(report.initial.js.rawBytes, Buffer.byteLength('console.log("radar");') + Buffer.byteLength('export const value = 1;'));
});

test('malformed static imports fail closed', () => {
  assert.throws(
    () => collectInitialAssetFiles({ 'index.html': { file: 'index.js', imports: ['missing.js'] } }, ['index.html']),
    /missing or malformed/,
  );
});

test('manifest asset paths cannot escape the build output directory', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'radar-bundle-budget-path-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifestPath = path.join(root, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({
    'index.html': { file: '../outside.js', isEntry: true },
  }));
  await assert.rejects(
    createBundleReport({ manifestPath, outDir: root }),
    /escapes build output directory/,
  );
});
