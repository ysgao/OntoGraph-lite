#!/usr/bin/env node
'use strict';

// Downloads and vendors the Eclipse Temurin 21 JRE (macOS arm64) into a gitignored local cache,
// verifies its checksum, and extracts it to dist/runtime/jre/ — run as part of `npm run build`
// (see research.md Decision 3: the runtime ships INSIDE the published npm tarball, not fetched
// at `npm install` time, for the strongest zero-dependency guarantee).

import { createHash } from 'crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { pipeline } from 'stream/promises';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.runtime-cache');
const RUNTIME_DIR = path.join(ROOT, 'dist', 'runtime');
const JRE_DIR = path.join(RUNTIME_DIR, 'jre');

const ADOPTIUM_API = 'https://api.adoptium.net/v3/assets/latest/21/hotspot?image_type=jre&os=mac&architecture=aarch64';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) { throw new Error(`Adoptium API request failed: ${res.status} ${res.statusText}`); }
  return res.json();
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok || !res.body) { throw new Error(`Download failed: ${res.status} ${res.statusText} (${url})`); }
  await pipeline(res.body, createWriteStream(destPath));
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    console.log(`[fetch-runtime] Skipping — this standalone build only supports macOS arm64 (detected ${process.platform}/${process.arch}). No runtime fetched.`);
    return;
  }

  mkdirSync(CACHE_DIR, { recursive: true });

  console.log('[fetch-runtime] Querying Adoptium API for the latest Temurin 21 (macOS arm64) JRE…');
  const [asset] = await fetchJson(ADOPTIUM_API);
  if (!asset) { throw new Error('Adoptium API returned no matching JRE asset'); }

  const { link: downloadUrl, checksum, name } = asset.binary.package;
  const archivePath = path.join(CACHE_DIR, name);

  if (existsSync(archivePath) && sha256(archivePath) === checksum) {
    console.log(`[fetch-runtime] Using cached, checksum-verified archive: ${archivePath}`);
  } else {
    console.log(`[fetch-runtime] Downloading ${downloadUrl}`);
    await downloadFile(downloadUrl, archivePath);
    const actual = sha256(archivePath);
    if (actual !== checksum) {
      rmSync(archivePath, { force: true });
      throw new Error(`Checksum mismatch for ${name}: expected ${checksum}, got ${actual}`);
    }
    console.log('[fetch-runtime] Checksum verified.');
  }

  rmSync(JRE_DIR, { recursive: true, force: true });
  mkdirSync(JRE_DIR, { recursive: true });

  console.log(`[fetch-runtime] Extracting to ${JRE_DIR}`);
  // Temurin's tarball has a single top-level directory (e.g. jdk-21.0.11+10-jre); strip it so
  // JRE_DIR itself becomes the JRE root (bin/, lib/, etc. directly under it).
  execFileSync('tar', ['-xzf', archivePath, '-C', JRE_DIR, '--strip-components=1']);

  // Temurin's macOS JRE tarball nests the JRE root under Contents/Home/ (app-bundle-style),
  // matching what src/reasonerRuntime.ts expects.
  const javaBin = path.join(JRE_DIR, 'Contents', 'Home', 'bin', 'java');
  if (!existsSync(javaBin)) {
    throw new Error(`Extraction did not produce a java executable at ${javaBin}`);
  }

  console.log('[fetch-runtime] Done.');
}

main().catch(err => {
  console.error(`[fetch-runtime] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
