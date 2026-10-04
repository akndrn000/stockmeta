// Prompt analisis kelayakan upload (M29, Mode Analisis) + parser hasil model.
// Peran DIBALIK dari prompt.ts: AI di sini REVIEWER stock photo yang menilai apakah gambar
// LAYAK diupload ke platform stock — BUKAN membuat metadata. Tanpa panggilan jaringan.
import type { AnalysisIssue, AnalysisIssueCategory, AnalysisResult, AnalysisVerdict, Platform } from './types';

export const ANALYSIS_VERDICTS: readonly AnalysisVerdict[] = ['layak', 'berpotensi-ditolak', 'perlu-tinjau'];

export const ANALYSIS_CATEGORIES: readonly AnalysisIssueCategory[] = [
  'kualitas-gambar',
  'konten-serupa',
  'watermark-logo',
  'hak-cipta-merek',
  'properti-model-release',
  'komposisi',
  'nilai-komersial',
  'ai-generated-disclosure',
  'lainnya'
];

// Label Indonesia untuk kategori masalah (dipakai AnalysisPanel + pesan UI).
export const ANALYSIS_CATEGORY_LABELS: Record<AnalysisIssueCategory, string> = {
  'kualitas-gambar': 'Kualitas gambar',
  'konten-serupa': 'Konten serupa',
  'watermark-logo': 'Watermark / logo',
  'hak-cipta-merek': 'Hak cipta / merek',
  'properti-model-release': 'Properti / model release',
  'komposisi': 'Komposisi',
  'nilai-komersial': 'Nilai komersial',
  'ai-generated-disclosure': 'AI-generated disclosure',
  'lainnya': 'Lainnya'
};

const PLATFORM_LABEL: Record<Platform, string> = {
  'adobe': 'Adobe Stock',
  'shutterstock': 'Shutterstock'
};

export function buildAnalysisPrompt({ platform }: { platform: Platform }): string {
  const label = PLATFORM_LABEL[platform];
  // Kebijakan AI-generated BERBEDA per platform — ini bagian yang sengaja tidak sama.
  const aiPolicy = platform === 'adobe'
    ? [
      'KEBIJAKAN AI-GENERATED (platform: Adobe Stock): Adobe Stock MENERIMA konten AI-generated DENGAN SYARAT disclosure saat upload.',
      'Kalau gambar terindikasi dibuat/dibantu AI (tekstur tidak natural, artefak khas AI generator, anatomi/fisika tidak masuk akal, detail latar meleleh/duplikat, dsb), tambahkan issue kategori "ai-generated-disclosure" dengan catatan agar kontributor memberi disclosure saat upload.',
      'Indikasi AI-generated BUKAN alasan penolakan — verdict tetap boleh "layak" kalau tidak ada masalah lain, cukup sertakan catatan disclosure tersebut.'
    ]
    : [
      'KEBIJAKAN AI-GENERATED (platform: Shutterstock): Shutterstock tidak menerima konten AI-generated dari kontributor.',
      'Kalau gambar terindikasi dibuat/dibantu AI (tekstur tidak natural, artefak khas AI generator, anatomi/fisika tidak masuk akal, detail latar meleleh/duplikat, dsb), verdict HARUS "berpotensi-ditolak" dengan issue kategori "ai-generated-disclosure" dan deskripsi tegas: "Shutterstock tidak menerima konten AI-generated dari kontributor."'
    ];
  const lines = [
    'Kamu adalah REVIEWER STOCK PHOTO yang menilai KELAYAKAN UPLOAD gambar ini ke ' + label + ' (platform: ' + label + ').',
    'Tugasmu HANYA menilai — JANGAN membuat judul, deskripsi, atau kata kunci.',
    'Penilaian ini KHUSUS untuk platform: ' + label + ' — terapkan kebijakan platform tersebut, bukan platform lain.',
    '',
    ...aiPolicy,
    '',
    'PENTING soal deteksi AI-generated: kamu (AI vision) tidak bisa memastikan 100% apakah sebuah gambar AI-generated atau bukan. Tandai HANYA kalau ada indikasi visual yang cukup jelas seperti contoh di atas — JANGAN menebak asal-asalan dari firasat tanpa bukti visual.',
    '',
    'Periksa kriteria penolakan umum industri stock photo berikut (hanya yang benar-benar terlihat):',
    '- Kualitas teknis: fokus/blur, noise berlebih, exposure buruk (terlalu gelap/terang), artefak kompresi, chromatic aberration yang terlihat jelas.',
    '- Konten terlalu umum/generik yang kemungkinan sudah banyak disubmit serupa. Kamu TIDAK punya akses ke database platform, jadi tidak bisa memastikan — kalau ragu, tandai "berpotensi" (verdict perlu-tinjau), JANGAN klaim pasti.',
    '- Watermark, logo, merek dagang, atau teks/tulisan tidak disengaja yang terlihat jelas di gambar.',
    '- Properti pribadi yang mudah dikenali atau wajah orang yang jelas teridentifikasi (butuh property/model release) — SEBUTKAN SECARA EKSPLISIT kalau terdeteksi, karena ini alasan penolakan serius.',
    '- Komposisi buruk (horizon miring parah, pemotongan objek penting, subjek terpotong, dsb).',
    '- Nilai komersial rendah (subjek terlalu personal, tidak reusable untuk pembeli).',
    '',
    'ATURAN KERAS:',
    '- Nilai HANYA dari apa yang benar-benar terlihat di gambar ini. JANGAN mengarang masalah yang tidak ada.',
    '- Untuk hal yang perlu verifikasi manusia (mis. kemiripan dengan portofolio/foto lain), beri verdict "perlu-tinjau", BUKAN klaim pasti ditolak.',
    '- Kalau tidak ada masalah yang terlihat, verdict "layak" dengan daftar issues kosong.',
    '',
    'Platform target: ' + platform,
    '',
    'Format JSON:',
    '{"verdict": "layak" | "berpotensi-ditolak" | "perlu-tinjau", "issues": array [{ "category": string salah satu dari: '
      + ANALYSIS_CATEGORIES.join(', ')
      + ', "description": string penjelasan singkat masalahnya }], "summary": string 1-2 kalimat ringkasan penilaian}',
    '',
    'Keluarkan HANYA JSON valid, tanpa teks tambahan, tanpa markdown code block.'
  ];
  return lines.join('\n');
}

// 'json' dipetakan retry sabar ke "respons tak tentu, coba lagi" (lihat toProviderError di retry.ts)
function jsonError(message: string): Error {
  return Object.assign(new Error(message), { kind: 'json' });
}

function pick(o: Record<string, unknown>, k: string): unknown {
  const hit = Object.keys(o).find((x) => x.toLowerCase() === k);
  return hit ? o[hit] : undefined;
}

export function parseAnalysisResponse(raw: string): AnalysisResult {
  const s = String(raw).trim()
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a === -1 || b <= a) throw jsonError('JSON tidak valid');
  let json: unknown;
  try { json = JSON.parse(s.slice(a, b + 1)); }
  catch { throw jsonError('JSON tidak valid'); }
  if (typeof json !== 'object' || json === null) throw jsonError('JSON tidak valid');
  const obj = json as Record<string, unknown>;

  const verdict = pick(obj, 'verdict');
  if (typeof verdict !== 'string' || !(ANALYSIS_VERDICTS as readonly string[]).includes(verdict)) {
    throw jsonError('Hasil analisis tidak valid: verdict tidak dikenal');
  }

  const issuesRaw = pick(obj, 'issues');
  const issues: AnalysisIssue[] = [];
  if (issuesRaw !== undefined) {
    if (!Array.isArray(issuesRaw)) throw jsonError('Hasil analisis tidak valid: issues bukan array');
    for (const item of issuesRaw) {
      if (typeof item !== 'object' || item === null) throw jsonError('Hasil analisis tidak valid: issue rusak');
      const io = item as Record<string, unknown>;
      if (!(ANALYSIS_CATEGORIES as readonly string[]).includes(String(io.category))) {
        throw jsonError('Hasil analisis tidak valid: kategori issue tidak dikenal');
      }
      if (typeof io.description !== 'string' || !io.description.trim()) {
        throw jsonError('Hasil analisis tidak valid: deskripsi issue kosong');
      }
      issues.push({ category: io.category as AnalysisIssueCategory, description: io.description.trim() });
    }
  }

  const summaryRaw = pick(obj, 'summary');
  const summary = typeof summaryRaw === 'string' ? summaryRaw.trim() : '';

  return { verdict: verdict as AnalysisVerdict, issues, summary };
}
