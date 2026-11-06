import fs from 'fs';
const files = [
  'src/utils/serverObjectStorage.ts',
  'src/utils/serverPublisherBargains.ts',
  'server.ts',
  'src/utils/osmTileProxy.ts',
];
const needles = [
  "cleanup-bargain",
  "file/:objectId",
  "object-storage/upload'",
  'reveal-contact',
  'air-quality',
  'system-health',
  'market-pulse"',
];
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  for (const n of needles) {
    let idx = 0;
    let hits = 0;
    while ((idx = t.indexOf(n, idx)) !== -1 && hits < 3) {
      const slice = t.slice(Math.max(0, idx - 80), idx + 1200).replace(/\s+/g, ' ');
      console.log('\n==', f, n);
      console.log(slice.slice(0, 900));
      idx += n.length;
      hits += 1;
    }
  }
}
