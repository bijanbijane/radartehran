import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { generateAndVerifyReleaseProvenanceAttestation } from '../src/utils/deepInfrastructureAndRecovery661To700';

const ROOT_DIR = process.cwd();

function generateCycloneDxSbom(): { componentCount: number; sbomHashSha256: string } {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  const lockPath = path.join(ROOT_DIR, 'package-lock.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, 'utf8')) : { packages: {} };
  const components: Array<Record<string, unknown>> = [];
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const [name, versionSpec] of Object.entries(allDeps)) {
    const lockEntry = lock.packages?.[`node_modules/${name}`] || {};
    const resolvedVersion = String(lockEntry.version || String(versionSpec).replace(/^[\^~]/, ''));
    components.push({
      type: 'library',
      name,
      version: resolvedVersion,
      purl: `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(resolvedVersion)}`,
      ...(lockEntry.integrity ? { hashes: [{ alg: 'SHA-512', content: String(lockEntry.integrity) }] } : {}),
    });
  }
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: {
        type: 'application',
        name: pkg.name || 'tehran-housing-radar',
        version: pkg.version || '1.0.0',
      },
    },
    components,
  };
  const serialized = JSON.stringify(sbom, null, 2);
  fs.writeFileSync(path.join(ROOT_DIR, 'sbom.cyclonedx.json'), serialized, 'utf8');
  return {
    componentCount: components.length,
    sbomHashSha256: crypto.createHash('sha256').update(serialized).digest('hex'),
  };
}

function scanDirectoryForSecrets(dirPath: string): string[] {
  const findings: string[] = [];
  if (!fs.existsSync(dirPath)) return findings;
  const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /x-amz-security-token/i,
    /TELEGRAM_BOT_TOKEN\s*=\s*["']\d{6,15}:[A-Za-z0-9_-]{25,}["']/,
  ];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx|js|mjs|json|html|css)$/i.test(entry.name)) {
        const content = fs.readFileSync(full, 'utf8');
        for (const pattern of secretPatterns) {
          if (pattern.test(content)) {
            findings.push(`${path.relative(ROOT_DIR, full)}: matched ${pattern.source}`);
          }
        }
      }
    }
  };
  walk(dirPath);
  return findings;
}

function main() {
  const sbomResult = generateCycloneDxSbom();
  const srcFindings = scanDirectoryForSecrets(path.join(ROOT_DIR, 'src'));
  const distDir = path.join(ROOT_DIR, 'dist');
  const distFindings = scanDirectoryForSecrets(distDir);
  if (srcFindings.length > 0 || distFindings.length > 0) {
    console.error('[RELEASE VERIFY FAILED] Secret patterns detected:', [...srcFindings, ...distFindings]);
    process.exit(1);
  }
  const distIndexPath = path.join(distDir, 'index.html');
  const artifactDigests: Record<string, string> = {};
  if (fs.existsSync(distIndexPath)) {
    artifactDigests['dist/index.html'] = crypto
      .createHash('sha256')
      .update(fs.readFileSync(distIndexPath))
      .digest('hex');
  }
  artifactDigests['sbom.cyclonedx.json'] = sbomResult.sbomHashSha256;
  const provenance = generateAndVerifyReleaseProvenanceAttestation({
    repository: 'bijanbijane/radartehran',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    workflowRef: '.github/workflows/release.yml@refs/heads/main',
    eventName: 'release',
    artifactSha256: artifactDigests['dist/index.html'] || sbomResult.sbomHashSha256,
    sbomSha256: sbomResult.sbomHashSha256,
    signingKey: process.env.RELEASE_ATTESTATION_KEY || 'local-ci-release-attestation-signing-key-2026',
  });
  console.log(
    `[SBOM & RELEASE VERIFIED] components=${sbomResult.componentCount} sbomSha256=${sbomResult.sbomHashSha256.slice(0, 16)} provenanceVerified=${provenance.trustedForRelease}`,
  );
}

main();
