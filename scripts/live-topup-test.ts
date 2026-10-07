// Tes live top-up M30 — BUKAN bagian build (tidak di-bundle Next, tidak dijalankan test otomatis).
// Jalankan (Gemini, sesuai permintaan verifikasi M30):
//   GEMINI_KEY=… npx tsx scripts/live-topup-test.ts gemini foto.jpg adobe "Tema Foto"
//   GROQ_KEY=…  npx tsx scripts/live-topup-test.ts groq foto.jpg shutterstock "Tema Foto"
// Melewati JALUR ASLI aplikasi (generateWithFallback): 1 panggilan awal + maks 2
// follow-up top-up (gambar dikirim ulang tiap percobaan, jeda antar percobaan,
// merge+dedupe+cap) — lalu finalisasi seperti useBatch (tanpa english-retry /
// perluasan / Tahap D; itu jaring lapis berikutnya di UI).
// Mencetak angka PERSIS per panggilan (1/2/3) + hasil akhir. Key hanya dari env —
// TIDAK PERNAH ditulis ke file atau log.
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { finalizeModelOutput } from '../src/lib/finalize';
import { TARGET_KEYWORDS_MIN } from '../src/lib/limits';
import { getProvider } from '../src/lib/providers';
import { generateWithFallback } from '../src/lib/providers/fallback';
import type { ImageInput } from '../src/lib/providers/types';
import type { Platform, ProviderId } from '../src/lib/types';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'
};

async function main(): Promise<void> {
  const [providerArg, imagePath, platformArg, themeArg] = process.argv.slice(2);
  if (!providerArg || !imagePath || !platformArg) {
    console.error('Pakai: GEMINI_KEY=… npx tsx scripts/live-topup-test.ts <gemini|groq|openrouter> <gambar> <adobe|shutterstock> [tema]');
    process.exit(1);
  }
  const provider = providerArg as ProviderId;
  const platform = platformArg as Platform;
  if (platform !== 'adobe' && platform !== 'shutterstock') {
    console.error('Platform tidak dikenal: ' + platformArg);
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

  const test = await getProvider(provider)?.testConnection(key);
  console.log(JSON.stringify({ test }, null, 2));
  if (!test?.ok) process.exit(1);

  // Jalur aplikasi asli — onTopup mencatat angka PERSIS tiap panggilan.
  const calls: { attempt: number; count: number }[] = [];
  const out = await generateWithFallback({
    provider,
    apiKey: key,
    image,
    platform,
    theme: themeArg,
    onTopup: (info) => {
      calls.push(info);
      console.log(`[live] panggilan ${info.attempt}: ${info.count} keyword`);
    }
  });
  console.log(JSON.stringify({
    topupAttempts: out.topupAttempts,
    topupCount: out.topupCount,
    usedFallback: out.usedFallback,
    finalProvider: out.provider
  }, null, 2));

  const fin = finalizeModelOutput(out.meta, platform);
  console.log(JSON.stringify({
    keywordAkhirFinalisasi: fin.meta.keywords?.length ?? 0,
    diBawahTarget: (fin.meta.keywords?.length ?? 0) < TARGET_KEYWORDS_MIN,
    contoh: (fin.meta.keywords ?? []).slice(0, 10)
  }, null, 2));
}

main().catch((err: unknown) => {
  console.error('Gagal: ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
