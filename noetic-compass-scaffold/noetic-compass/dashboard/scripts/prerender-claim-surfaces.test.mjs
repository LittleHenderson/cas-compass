import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { prerenderClaimSurfaces } from './prerender-claim-surfaces.mjs';


const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_PATH = resolve(HERE, '..', 'src', 'claimSurfaces.json');
const BASE_HTML = [
  '<!doctype html><html lang="en"><head><meta charset="UTF-8" />',
  '<title>CAS Compass | CAS Lab</title>',
  '<meta name="description" content="CAS Compass — Cognitive architecture assessment, audit, and interpretability workbench by CAS Lab." />',
  '</head><body><div id="root"></div>',
  '<script type="module" crossorigin src="/assets/index-abc123.js"></script>',
  '</body></html>',
].join('');


async function fixture() {
  const directory = await mkdtemp(resolve(tmpdir(), 'cas-claim-prerender-'));
  await writeFile(resolve(directory, 'index.html'), BASE_HTML, 'utf8');
  return directory;
}


test('writes two exact route documents and a neutral SPA fallback', async (context) => {
  const distDir = await fixture();
  context.after(() => rm(distDir, { recursive: true, force: true }));

  const result = await prerenderClaimSurfaces({ distDir, contentPath: CONTENT_PATH });
  assert.equal(result.schemaVersion, 'cas_claim_surface.v1');
  assert.deepEqual(
    result.outputs.map(({ kind, route, output }) => ({ kind, route, output })),
    [
      { kind: 'product_app', route: '/', output: 'index.html' },
      { kind: 'audit_console', route: '/audit-console', output: 'audit-console/index.html' },
    ],
  );

  const [product, audit, spa] = await Promise.all([
    readFile(resolve(distDir, 'index.html'), 'utf8'),
    readFile(resolve(distDir, 'audit-console', 'index.html'), 'utf8'),
    readFile(resolve(distDir, 'spa.html'), 'utf8'),
  ]);

  assert.match(product, /<title>CAS Compass \| CAS Lab<\/title>/);
  assert.match(product, /data-cas-prerendered-route="\/"/);
  assert.match(product, /data-cas-prerender-kind="product_app"/);
  assert.match(product, /<h1[^>]*>CAS Compass<\/h1>/);
  assert.match(product, /Customer-production status: OPEN\./);
  assert.match(product, /Research verdicts do not establish customer-production ACCEPT\./);
  assert.match(product, /FLAG_FOR_HUMAN_REVIEW/);
  assert.match(product, /Evidence is present only when a named artifact passes its contract; otherwise that evidence is unavailable\./);
  assert.match(product, /No compliance certification or universal safety conclusion is asserted\./);

  assert.match(audit, /<title>Audit Console \| CAS Compass<\/title>/);
  assert.match(audit, /data-cas-prerendered-route="\/audit-console"/);
  assert.match(audit, /data-cas-prerender-kind="audit_console"/);
  assert.match(audit, /<h1[^>]*>Audit Console<\/h1>/);
  assert.match(audit, /Customer-production status: OPEN\./);
  assert.match(audit, /FLAG_FOR_HUMAN_REVIEW/);
  assert.match(audit, /Evidence is present only when a named artifact passes its contract; otherwise that evidence is unavailable\./);

  for (const html of [product, audit]) {
    assert.match(html, /data-cas-prerender-schema="cas_claim_surface\.v1"/);
    assert.match(html, /<script type="module" crossorigin src="\/assets\/index-abc123\.js"><\/script>/);
    assert.doesNotMatch(html, /<noscript\b/i);
    assert.doesNotMatch(html, /data-cas-static-claim-surface[^>]*\shidden(?:\s|=|>)/i);
    assert.doesNotMatch(html, /data-cas-static-claim-surface[^>]*aria-hidden="true"/i);
  }
  assert.notEqual(product, audit);
  assert.equal(spa, BASE_HTML);
  assert.match(spa, /<div id="root"><\/div>/);
  assert.doesNotMatch(spa, /data-cas-prerendered-route/);
  assert.doesNotMatch(spa, /data-cas-static-claim-surface/);
});


test('fails closed when content attempts to move a pinned route', async (context) => {
  const distDir = await fixture();
  context.after(() => rm(distDir, { recursive: true, force: true }));
  const content = JSON.parse(await readFile(CONTENT_PATH, 'utf8'));
  content.surfaces.audit_console.route = '/generic-fallback';
  const invalidContentPath = resolve(distDir, 'invalid-content.json');
  await writeFile(invalidContentPath, JSON.stringify(content), 'utf8');

  await assert.rejects(
    prerenderClaimSurfaces({ distDir, contentPath: invalidContentPath }),
    /must use its exact pinned route/,
  );
});


test('fails closed when the Vite application mount is missing or duplicated', async (context) => {
  const distDir = await fixture();
  context.after(() => rm(distDir, { recursive: true, force: true }));
  await writeFile(
    resolve(distDir, 'index.html'),
    BASE_HTML.replace('</body>', '<div id="root"></div></body>'),
    'utf8',
  );

  await assert.rejects(
    prerenderClaimSurfaces({ distDir, contentPath: CONTENT_PATH }),
    /empty application mount must occur exactly once/,
  );
});


test('Vercel serves exact claim documents and keeps unrelated SPA routes neutral', async () => {
  const config = JSON.parse(
    await readFile(resolve(HERE, '..', 'vercel.json'), 'utf8'),
  );
  const nonApiRewrites = config.rewrites.slice(1);
  assert.deepEqual(nonApiRewrites.slice(0, 3), [
    { source: '/', destination: '/index.html' },
    { source: '/audit-console', destination: '/audit-console/index.html' },
    { source: '/audit-console/', destination: '/audit-console/index.html' },
  ]);
  const spaRewrites = nonApiRewrites.slice(3);
  assert.ok(spaRewrites.length >= 1, 'expected neutral /spa.html fallback rewrites');
  assert.ok(
    spaRewrites.every((rule) => rule.destination === '/spa.html'),
    'every non-claim SPA rewrite must target neutral /spa.html',
  );
  assert.deepEqual(spaRewrites.at(-1), {
    source: '/((?!assets/|api/).*)',
    destination: '/spa.html',
  });
});
