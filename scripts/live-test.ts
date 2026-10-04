// Tes live manual — BUKAN bagian build (tidak di-bundle Next, tidak dijalankan test otomatis).
// Jalankan:
//   GEMINI_KEY=… npx tsx scripts/live-test.ts gemini foto.jpg adobe "Halloween"
//   GROQ_KEY=…  npx tsx scripts/live-test.ts groq foto.jpg shutterstock
//   OPENROUTER_KEY=… npx tsx scripts/live-test.ts openrouter foto.jpg adobe
// Key hanya dibaca dari environment variable — TIDAK PERNAH ditulis ke file atau log.
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { getProvider } from '../src/lib/providers';
import type { ImageInput } from '../src/lib/providers/types';
import type { Platform, ProviderId } from '../src/lib/types';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'
};

async function main(): Promise<void> {
  const [providerArg, imagePath, platformArg, themeArg] = process.argv.slice(2);
  if (!providerArg || !imagePath || !platformArg) {
    console.error('Pakai: GEMINI_KEY=… npx tsx scripts/live-test.ts <gemini|groq|custom> <gambar> <adobe|shutterstock> [tema]');
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
    : provider === 'custom' ? 'CUSTOM_KEY' : 'GROQ_KEY';
  const key = process.env[keyEnv];
  if (!key) {
    console.error('Set environment variable ' + keyEnv + ' terlebih dahulu.');
    process.exit(1);
  }
  // provider custom: base URL + model dari environment (tanpa hardcode layanan)
  const baseUrl = provider === 'custom' ? (process.env.CUSTOM_BASE_URL ?? '') : undefined;
  const model = provider === 'custom' ? (process.env.CUSTOM_MODEL ?? '') : undefined;

  const buf = await readFile(imagePath);
  const image: ImageInput = {
    base64: buf.toString('base64'),
    mimeType: MIME[extname(imagePath).toLowerCase()] ?? 'image/jpeg'
  };

  const test = await adapter.testConnection(key, { baseUrl, model });
  console.log(JSON.stringify({ test }, null, 2));
  if (!test.ok) process.exit(1);

  const result = await adapter.generateForImage({
    apiKey: key,
    image,
    platform,
    theme: themeArg,
    baseUrl,
    model
  });
  console.log(JSON.stringify({ result }, null, 2));
}

main().catch((err: unknown) => {
  console.error('Gagal: ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
