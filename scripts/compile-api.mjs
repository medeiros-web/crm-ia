// Compila os handlers TypeScript da pasta api/ para api-compiled/ usando esbuild
import { build } from 'esbuild';
import { readdirSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const apiDir = join(root, 'api');
const outDir = join(root, 'api-compiled');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const tsFiles = readdirSync(apiDir).filter(f => f.endsWith('.ts'));

for (const file of tsFiles) {
  await build({
    entryPoints: [join(apiDir, file)],
    outdir: outDir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    external: ['node:*', 'crypto', 'fs', 'path', 'os'],
  });
  console.log(`Compiled: ${file}`);
}

console.log('API compilation done.');
