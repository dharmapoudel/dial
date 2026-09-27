#!/usr/bin/env bun
// Zip dist/ contents -> dial-<version>.zip (sideload artifact).
// Validates the manifest first: id present + version match + icon present.
import { zipSync } from 'fflate';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const repoDir = resolve(import.meta.dir, '..');
const distDir = resolve(repoDir, 'dist');
const manifestPath = join(distDir, 'manifest.json');

if (!existsSync(manifestPath)) {
  console.error(`no manifest.json at ${manifestPath}; run 'bun run build:app' first`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!manifest.id) throw new Error('manifest has no id — refusing to zip');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(manifest.id))
  throw new Error(`manifest id is not a uuid: ${manifest.id}`);
const pkg = JSON.parse(readFileSync(join(repoDir, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version)
  throw new Error(`manifest version ${manifest.version} != package.json ${pkg.version}`);
if (!existsSync(join(distDir, 'icon.png'))) throw new Error('dist/icon.png missing');
if (!existsSync(join(distDir, 'settings.html')))
  throw new Error('dist/settings.html missing — run the full build, not just build:app');

const files = {};
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs);
    else files[relative(distDir, abs)] = new Uint8Array(readFileSync(abs));
  }
}
walk(distDir);

const outPath = resolve(repoDir, `dial-${manifest.version}.zip`);
writeFileSync(outPath, zipSync(files, { level: 9 }));
console.log(`wrote ${relative(process.cwd(), outPath)} (${Object.keys(files).length} files)`);
