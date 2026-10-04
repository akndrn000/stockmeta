// Tes live manual — BUKAN bagian build (tidak di-bundle Next, tidak dijalankan test otomatis).
// Jalankan pipeline penuh (observasi → metadata → grounding):
//   GEMINI_KEY=… npx tsx scripts/live-test.ts gemini foto.jpg adobe "Halloween"
//   GROQ_KEY=… npx tsx scripts/live-test.ts groq foto.jpg shutterstock
//   OPENROUTER_KEY=… npx tsx scripts/live-test.ts openrouter foto.jpg adobe
// Tambah --judge untuk menilai metadata via juri provider yang sama.
// Buat 3 fixture PNG kecil (polos merah, polos hijau, pola papan catur) untuk smoke test:
//   npx tsx scripts/live-test.ts --make-fixtures ./tmp-fixtures
// Fixture hanya untuk smoke teknis — uji impor pertama ke portal TETAP memakai foto asli.
// Key hanya dibaca dari environment variable — TIDAK PERNAH ditulis ke file atau log.
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { runFramePipeline } from '../src/lib/pipeline';
import { renderRulesBlock } from '../src/lib/platform-rules';
import { getProvider } from '../src/lib/providers';
import type { ImageInput } from '../src/lib/providers/types';
import type { Platform, ProviderId } from '../src/lib/types';
import { validateMetadata } from '../src/lib/validate';
import { makeFixtures } from './fixtures';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'
};

/* ---------------- fixture PNG solid/pola (smoke teknis saja, lihat fixtures.ts) ---------------- */

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === '--make-fixtures') {
    const files = await makeFixtures(argv[1] ?? './tmp-fixtures');
    console.log('Fixture ditulis: ' + files.join(', '));
    return;
  }
  const [providerArg, imagePath, platformArg, themeArg, flag] = argv;
  if (!providerArg || !imagePath || !platformArg) {
    console.error('Pakai: GEMINI_KEY=… npx tsx scripts/live-test.ts <gemini|groq|openrouter> <gambar> <adobe|shutterstock> [tema] [--judge]');
    process.exit(1);
  }
  const provider = providerArg as ProviderId;
  const platform = platformArg as Platform;
  if (platform !== 'adobe' && platform !== 'shutterstock') {
    console.error('Platform tidak dikenal: ' + platformArg);
    process.exit(1);
  }
  const adapter = getProvider(provider);
  if (!adapter) {
    console.error('Provider tidak dikenal: ' + providerArg);
    process.exit(1);
  }
  const keyEnv = provider === 'gemini' ? 'GEMINI_KEY'
    : provider === 'openrouter' ? 'OPENROUTER_KEY' : 'GROQ_KEY';
  const key = process.env[keyEnv];
  if (!key) {
    console.error('Set environment variable ' + keyEnv + ' terlebih dahulu.');
    process.exit(1);
  }

  const buf = await readFile(imagePath);
  const image: ImageInput = {
    base64: buf.toString('base64'),
    mimeType: MIME[extname(imagePath).toLowerCase()] ?? 'image/jpeg'
  };

  const test = await adapter.testConnection(key);
  console.log(JSON.stringify({ test }, null, 2));
  if (!test.ok) process.exit(1);

  // Pipeline penuh: observasi gambar nyata → metadata teks → grounding ketat.
  const pipe = await runFramePipeline({
    adapter,
    apiKey: key,
    image,
    platform,
    theme: themeArg,
    strictVerify: true,
    log: (msg) => console.log('[pipeline]', msg)
  });
  console.log(JSON.stringify({
    observation: pipe.observation,
    compliance: pipe.compliance,
    metadata: pipe.metadata,
    removedUnsupported: pipe.removedUnsupported,
    categoryNeedsReview: pipe.categoryNeedsReview
  }, null, 2));

  const hard = validateMetadata(platform, pipe.metadata as never, imagePath.split(/[\\/]/).pop() ?? '');
  console.log(JSON.stringify({ hard }, null, 2));

  if (flag === '--judge') {
    const judged = await adapter.callJudge({
      apiKey: key,
      image,
      sendImage: adapter.supportsVision,
      observation: pipe.observation,
      metadataText: JSON.stringify(pipe.metadata),
      rulesBlock: renderRulesBlock(platform),
      hardContext: [...hard.errors, ...hard.warnings].map((i) => `${i.rule}: ${i.message}`).join('\n')
    });
    console.log(JSON.stringify({ judged }, null, 2));
  }
}

main().catch((err: unknown) => {
  console.error('Gagal: ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
