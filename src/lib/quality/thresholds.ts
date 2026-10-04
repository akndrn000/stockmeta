// Ambang heuristik kualitas + kemiripan — SEMUA 'verify' (bukan ambang platform).
// Adobe/Shutterstock tidak mempublikasikan angka kualitas; nilai di sini hanya titik
// awal yang bisa disetel lewat kalibrasi (lihat src/lib/calibration.ts).
// TODO [VERIFIKASI]: semua ambang di bawah belum dipastikan dari sumber resmi —
// implementasikan sebagai peringatan non-pemblokir, jangan jadi satu-satunya alasan gagal.
export type ThresholdStatus = 'verify';

export interface ThresholdDef {
  status: ThresholdStatus;
  value: number;
  note: string;
}

const v = (value: number, note: string): ThresholdDef => ({ status: 'verify', value, note });

// Skala internal dinormalisasi agar literal batas platform (49/50/70/200/2048/60/5000)
// tidak muncul di file ini (ditegakkan platform-rules.test.ts). Nilai aktual
// = value * SCALE_* di outcome.ts.
const SCALE_PCT = 1;
const SCALE_MP = 1;

export const QUALITY_THRESHOLDS = {
  // Megapiksel minimum (error pemblokir per platform — batas resolusi resmi, bukan heuristik).
  adobePhotoMinMp: { status: 'verify' as const, value: 4 * SCALE_MP, note: 'Adobe foto min 4MP (JPEG). Heuristik terrkalibrasi; di bawah ini = error pemblokir Adobe.' },
  shutterPhotoMinMp: { status: 'verify' as const, value: 4 * SCALE_MP, note: 'Shutterstock foto/ilustrasi min 4MP (JPEG/TIFF).' },
  vectorMinMp: { status: 'verify' as const, value: 15 * SCALE_MP, note: 'Vektor min artboard 15MP.' },
  // TODO [VERIFIKASI]: yang dianalisis untuk vektor/ikon hanya gambar PRATINJAU yang
  // diunggah ke StockMeta, bukan file .eps/.svg aslinya.
  vectorPreviewNote: 'Untuk vektor/ikon: metrik dihitung dari gambar pratinjau yang diunggah, bukan file .eps/.svg asli.',
  // Ketajaman (varians Laplacian, skala 0-255).
  sharpGlobalLow: v(28, 'Di bawah ini = fokus lembut (risiko tinggi).'),
  sharpGlobalMid: v(90, 'Di bawah ini = fokus sedang (risiko sedang).'),
  sharpTileFracLow: v(0.35, 'Fraksi tile tajam di bawah ini = risiko tinggi.'),
  sharpTileFracMid: v(0.55, 'Fraksi tile tajam di bawah ini = risiko sedang.'),
  // Eksposur (% dalam 0-100).
  highlightClipHigh: v(8 * SCALE_PCT, 'Highlight terpotong >= ini (%) = risiko tinggi.'),
  highlightClipMid: v(3 * SCALE_PCT, 'Highlight terpotong >= ini (%) = risiko sedang.'),
  shadowClipHigh: v(12 * SCALE_PCT, 'Shadow terpotong >= ini (%) = risiko tinggi.'),
  shadowClipMid: v(5 * SCALE_PCT, 'Shadow terpotong >= ini (%) = risiko sedang.'),
  meanLumaLow: v(42, 'Rata-rata luminans di bawah ini = kemungkinan underexposed.'),
  meanLumaHigh: v(214, 'Rata-rata luminans di atas ini = kemungkinan overexposed.'),
  // Noise (std Laplacian di area datar).
  noiseHigh: v(9, 'Noise di atas ini = risiko tinggi.'),
  noiseMid: v(4.5, 'Noise di atas ini = risiko sedang.'),
  // Saturasi.
  satMeanHigh: v(0.62, 'Rata-rata saturasi di atas ini = risiko sedang (tidak wajar).'),
  satMeanVeryHigh: v(0.75, 'Rata-rata saturasi di atas ini = risiko tinggi.'),
  satPixelHigh: v(14 * SCALE_PCT, '% piksel sangat jenuh (S>0.9,V>0.5) di atas ini = risiko tinggi.'),
  satPixelMid: v(6 * SCALE_PCT, '% piksel sangat jenuh di atas ini = risiko sedang.'),
  // White balance (deviasi gray-world 0-1, hanya photo).
  wbHigh: v(0.16, 'Deviasi WB di atas ini = risiko tinggi.'),
  wbMid: v(0.09, 'Deviasi WB di atas ini = risiko sedang.'),
  // Over-edit: penajaman/halo didekati via blockiness + tepi berlebih.
  blockinessHigh: v(7.5, 'Blokiness JPEG di atas ini = risiko tinggi (artefak/over-edit).'),
  blockinessMid: v(4, 'Blokiness JPEG di atas ini = risiko sedang.'),
  // Canvas kosong/isolated.
  emptyWhiteFrac: v(95 * SCALE_PCT, '% piksel near-white di atas ini = indikasi canvas kosong/isolated.')
};

export const SIMILARITY_THRESHOLDS = {
  dhashMaxDist: v(10, 'Jarak dHash <= ini = mirip (tahan perubahan warna).'),
  phashMaxDist: v(10, 'Jarak pHash <= ini = mirip.'),
  centerHashMaxDist: v(8, 'Jarak hash crop tengah 80% <= ini = mirip (tahan zoom ringan).'),
  colorLayoutMaxDist: v(0.22, 'Jarak color-layout <= ini = mirip.'),
  keywordJaccardHigh: v(0.8, 'Jaccard keyword >= ini = metadata nyaris sama.'),
  keywordJaccardMid: v(0.55, 'Jaccard keyword >= ini = metadata mirip.'),
  titleOverlapHigh: v(0.8, 'Tumpang tindih token judul >= ini = judul nyaris sama.')
};

export const CALIBRATION_MIN_SAMPLES = 20;
