/**
 * @file scripts/check-architecture.ts
 * @description Automated Architecture & Module-Boundary Guardrail Checker.
 * Enforces file size thresholds, legacy ratchet ceilings, dataset exclusion rules,
 * and strict unidirectional module dependency boundaries across the repository.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface ArchitectureBaselineConfig {
  schemaVersion: string;
  thresholds: { warningLines: number; reviewLines: number; maxLinesNewFile: number };
  datasetExclusions: Record<string, { category: string; maxLines: number; rationale: string }>;
  trackedLegacyFiles: Record<string, { baselineLines: number; maxLines: number; targetLines: number; owner?: string; rationale: string }>;
}

export interface FileViolation {
  file: string;
  severity: 'ERROR' | 'WARN' | 'LEGACY_TRACKED';
  code: 'NEW_FILE_OVERSIZED' | 'LEGACY_FILE_GREW' | 'DATASET_EXCEEDED_CAP' | 'DATASET_IMPORTS_UI' | 'UPWARD_DEPENDENCY' | 'SIZE_REVIEW_WARNING' | 'LEGACY_DEBT_NOTICE';
  lines: number;
  limit: number;
  message: string;
}

export interface ArchitectureCheckResult {
  passed: boolean;
  scannedFilesCount: number;
  errors: FileViolation[];
  warnings: FileViolation[];
  legacyTracked: FileViolation[];
}

export interface VirtualFileOverride { relPath: string; content: string; }

const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', '__tests__']);

export function collectSourceFiles(rootDir: string): string[] {
  const seen = new Set<string>();
  const resolvedRoot = path.resolve(rootDir);
  const topServer = path.join(resolvedRoot, 'server.ts');
  const apiServer = path.join(resolvedRoot, 'apps/api/server.ts');
  if (fs.existsSync(topServer)) {
    seen.add('server.ts');
  }
  if (fs.existsSync(apiServer)) {
    seen.add('apps/api/server.ts');
  }

  const walk = (dirRel: string) => {
    const absDir = path.resolve(resolvedRoot, dirRel);
    if (!absDir.startsWith(resolvedRoot + path.sep) && absDir !== resolvedRoot) return;
    if (!fs.existsSync(absDir)) return;
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const rel = path.posix.join(dirRel.replace(/\\/g, '/'), entry.name);
        walk(rel);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
        const rel = path.posix.join(dirRel.replace(/\\/g, '/'), entry.name);
        seen.add(rel);
      }
    }
  };

  walk('src');
  walk('server/modules');
  return Array.from(seen).sort();
}

function extractImports(content: string): string[] {
  const imports: string[] = [];
  const staticImportRegex = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

  let match: RegExpExecArray | null;
  while ((match = staticImportRegex.exec(content)) !== null) {
    if (match[1]) imports.push(match[1]);
  }
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    if (match[1]) imports.push(match[1]);
  }
  return imports;
}

/**
 * Runs the architecture guardrail check against the workspace or a virtual file override set (for testing).
 */
export function runArchitectureCheck(options?: {
  rootDir?: string;
  baselineConfig?: ArchitectureBaselineConfig;
  virtualOverrides?: VirtualFileOverride[];
}): ArchitectureCheckResult {
  const rootDir = options?.rootDir || process.cwd();
  const baselinePath = path.join(rootDir, 'architecture-baseline.json');
  const baseline: ArchitectureBaselineConfig =
    options?.baselineConfig || JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));

  const fileMap = new Map<string, string>();
  for (const relPath of collectSourceFiles(rootDir)) {
    const fullPath = path.join(rootDir, relPath);
    fileMap.set(relPath, fs.readFileSync(fullPath, 'utf-8'));
  }

  if (options?.virtualOverrides) {
    for (const vo of options.virtualOverrides) {
      fileMap.set(vo.relPath, vo.content);
    }
  }

  const errors: FileViolation[] = [];
  const warnings: FileViolation[] = [];
  const legacyTracked: FileViolation[] = [];

  for (const [relPath, content] of fileMap.entries()) {
    const trimmedTrailing = content.replace(/\r?\n$/, '');
    const lines = trimmedTrailing.length === 0 ? 0 : trimmedTrailing.split(/\r?\n/).length;
    const imports = extractImports(content);

    // 1. Check Unidirectional Layer Dependency Boundaries
    // Layer hierarchy: src/types -> src/utils -> src/data -> src/components -> src/App.tsx
    if (relPath.startsWith('src/types/')) {
      for (const imp of imports) {
        if (
          imp.includes('/data/') ||
          imp.includes('../data') ||
          imp.includes('/components/') ||
          imp.includes('../components') ||
          imp.includes('../App')
        ) {
          errors.push({
            file: relPath,
            severity: 'ERROR',
            code: 'UPWARD_DEPENDENCY',
            lines,
            limit: 0,
            message: `Layer violation: Type definition file '${relPath}' must not import upward module '${imp}'.`,
          });
        }
      }
    }

    if (
      relPath.startsWith('src/utils/') ||
      relPath.startsWith('src/data/') ||
      relPath.startsWith('src/cells/') ||
      relPath.startsWith('server/')
    ) {
      for (const imp of imports) {
        if (
          imp.includes('/components/') ||
          imp.includes('../components') ||
          imp.includes('../App') ||
          imp.endsWith('/App')
        ) {
          errors.push({
            file: relPath,
            severity: 'ERROR',
            code: 'UPWARD_DEPENDENCY',
            lines,
            limit: 0,
            message: `Layer violation: Domain/utility module '${relPath}' must not import UI component '${imp}'.`,
          });
        }
      }
    }

    // 2. Check Static Dataset Exclusions
    const datasetRule = baseline.datasetExclusions[relPath];
    if (datasetRule) {
      for (const imp of imports) {
        if (imp === 'react' || imp.startsWith('react/') || imp.includes('lucide-react')) {
          errors.push({
            file: relPath,
            severity: 'ERROR',
            code: 'DATASET_IMPORTS_UI',
            lines,
            limit: datasetRule.maxLines,
            message: `Dataset exclusion violation: '${relPath}' imports UI library '${imp}' and no longer qualifies as a pure dataset/domain file.`,
          });
        }
      }
      if (lines > datasetRule.maxLines) {
        errors.push({
          file: relPath,
          severity: 'ERROR',
          code: 'DATASET_EXCEEDED_CAP',
          lines,
          limit: datasetRule.maxLines,
          message: `Dataset '${relPath}' (${lines} lines) exceeded its maximum allowed cap (${datasetRule.maxLines} lines).`,
        });
      }
      continue;
    }

    // 3. Check Tracked Legacy Files (Ratchet Enforcement)
    const legacyRule = baseline.trackedLegacyFiles[relPath];
    if (legacyRule) {
      if (lines > legacyRule.maxLines) {
        errors.push({
          file: relPath,
          severity: 'ERROR',
          code: 'LEGACY_FILE_GREW',
          lines,
          limit: legacyRule.maxLines,
          message: `Legacy file '${relPath}' grew to ${lines} lines, exceeding its locked ratchet ceiling of ${legacyRule.maxLines} lines (target: ${legacyRule.targetLines}). Extract new functionality into a dedicated module.`,
        });
      } else {
        legacyTracked.push({
          file: relPath,
          severity: 'LEGACY_TRACKED',
          code: 'LEGACY_DEBT_NOTICE',
          lines,
          limit: legacyRule.maxLines,
          message: `Tracked legacy file (${lines}/${legacyRule.maxLines} ceiling, target <= ${legacyRule.targetLines} lines).`,
        });
      }
      continue;
    }

    // 4. Check Standard & Newly Created Implementation Files
    if (lines >= baseline.thresholds.maxLinesNewFile) {
      errors.push({
        file: relPath,
        severity: 'ERROR',
        code: 'NEW_FILE_OVERSIZED',
        lines,
        limit: baseline.thresholds.maxLinesNewFile,
        message: `File '${relPath}' has ${lines} lines, exceeding the maximum allowed ${baseline.thresholds.maxLinesNewFile} lines for non-legacy implementation files. Split responsibilities into focused modules.`,
      });
    } else if (lines >= baseline.thresholds.warningLines) {
      warnings.push({
        file: relPath,
        severity: 'WARN',
        code: 'SIZE_REVIEW_WARNING',
        lines,
        limit: baseline.thresholds.maxLinesNewFile,
        message: `File '${relPath}' has ${lines} lines (>= ${baseline.thresholds.warningLines} warning threshold, max ${baseline.thresholds.maxLinesNewFile}). Review responsibilities before adding more code.`,
      });
    }
  }

  return {
    passed: errors.length === 0,
    scannedFilesCount: fileMap.size,
    errors,
    warnings,
    legacyTracked,
  };
}

// CLI execution when run directly via `tsx scripts/check-architecture.ts`
const isMain =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  process.argv[1].endsWith('check-architecture.ts');

if (isMain) {
  const result = runArchitectureCheck();
  console.log('================================================================');
  console.log('🏛️  ARCHITECTURE & MODULE BOUNDARY GUARDRAIL REPORT');
  console.log('================================================================');
  console.log(`Scanned implementation files: ${result.scannedFilesCount}`);
  console.log(`Tracked legacy files (ratchet-locked): ${result.legacyTracked.length}`);
  console.log(`Size review warnings (300-499 lines): ${result.warnings.length}`);
  console.log(`Blocking architecture errors: ${result.errors.length}`);

  if (result.warnings.length > 0) {
    console.log('\n--- ⚠️  Review Warnings (300–499 lines, allowed under 500 ceiling) ---');
    for (const w of result.warnings.slice(0, 25)) {
      console.log(`  [WARN] ${w.file} (${w.lines} lines): ${w.message}`);
    }
    if (result.warnings.length > 25) {
      console.log(`  ... and ${result.warnings.length - 25} more files in 300–499 line range.`);
    }
  }

  if (result.legacyTracked.length > 0) {
    console.log(`\n--- 📌 Tracked Legacy Debt Register (${result.legacyTracked.length} ratchet-locked files) ---`);
    for (const l of result.legacyTracked.slice(0, 15)) {
      console.log(`  [LEGACY] ${l.file}: ${l.lines} lines (ceiling: ${l.limit})`);
    }
    if (result.legacyTracked.length > 15) {
      console.log(`  ... and ${result.legacyTracked.length - 15} more tracked legacy files.`);
    }
  }

  if (!result.passed) {
    console.error('\n--- ❌ BLOCKING ARCHITECTURE VIOLATIONS ---');
    for (const err of result.errors) {
      console.error(`  [ERROR:${err.code}] ${err.file} (${err.lines} lines): ${err.message}`);
    }
    process.exit(1);
  }

  console.log('\n[PASS] All architecture boundaries and ratchet ceilings verified (0 errors).');
  console.log('================================================================');
}
