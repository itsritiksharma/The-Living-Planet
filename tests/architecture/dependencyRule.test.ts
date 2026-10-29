import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');
type Layer = 'domain' | 'application' | 'contracts' | 'infrastructure' | 'ui' | 'entry';

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesIn(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

function layerOf(path: string): Layer {
  const top = relative(SRC, path).split(sep)[0];
  if (top === 'domain' || top === 'application' || top === 'contracts' || top === 'infrastructure' || top === 'ui') return top;
  return 'entry';
}

interface ImportRef {
  specifier: string;
  typeOnly: boolean;
}

function importsOf(source: string): ImportRef[] {
  const refs: ImportRef[] = [];
  const pattern = /^\s*(import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
  for (const match of source.matchAll(pattern)) refs.push({ specifier: match[3] as string, typeOnly: Boolean(match[2]) });
  return refs;
}

/** Which layers each layer may depend on (Clean Architecture: dependencies point inward). */
const ALLOWED: Record<Layer, Layer[]> = {
  domain: ['domain'],
  application: ['domain', 'application', 'contracts'],
  contracts: ['contracts', 'domain'],
  infrastructure: ['domain', 'application', 'contracts', 'infrastructure'],
  ui: ['ui', 'contracts'],
  entry: ['ui', 'contracts'],
};

const files = filesIn(SRC);

describe('Dependency rule', () => {
  it.each(files.map((f) => [relative(SRC, f), f] as const))('%s only depends inward', (_name, file) => {
    const layer = layerOf(file);
    for (const ref of importsOf(readFileSync(file, 'utf8'))) {
      if (ref.specifier.startsWith('.')) {
        const target = layerOf(resolve(dirname(file), ref.specifier));
        expect(ALLOWED[layer], `${ref.specifier} (${target})`).toContain(target);
        if (layer === 'contracts' && target === 'domain') expect(ref.typeOnly, `${ref.specifier} must be a type-only import`).toBe(true);
      } else if (layer === 'domain' || layer === 'application' || layer === 'contracts') {
        expect.fail(`${layer} must not import external package "${ref.specifier}"`);
      } else if (layer === 'ui' || layer === 'entry') {
        expect(['react', 'react-dom/client', 'react/jsx-runtime'], ref.specifier).toContain(ref.specifier);
      }
    }
  });
});

describe('Domain purity (determinism)', () => {
  const domainFiles = files.filter((f) => layerOf(f) === 'domain');
  it.each(domainFiles.map((f) => [relative(SRC, f), f] as const))('%s reads no clock, randomness or environment', (_name, file) => {
    const source = readFileSync(file, 'utf8');
    for (const forbidden of ['Math.random', 'Date.now', 'new Date', 'performance.now', 'setTimeout', 'setInterval', 'process.', 'crypto.']) {
      expect(source.includes(forbidden), forbidden).toBe(false);
    }
  });
});
