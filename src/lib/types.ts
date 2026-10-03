// Tipe inti domain StockMeta — satu-satunya sumber bentuk data lintas modul (lihat legacy/js/*.js).

export type Platform = "adobe" | "shutterstock";

export type ProviderId = "gemini" | "groq" | "openrouter" | "coming-soon";

export type ConnectionStatus = "idle" | "testing" | "ok" | "fail";

export type FrameStatus = "menunggu" | "memproses" | "siap" | "gagal";

export interface AdobeMetadata {
  title: string;
  keywords: string[];
  category: string;
  /** M11: true kalau kategori diisi otomatis oleh sistem (bukan pilihan user) → tampil saran periksa */
  categoryAuto?: boolean;
}

export interface ShutterstockMetadata {
  description: string;
  keywords: string[];
  categories: string[];
  /** sama dengan AdobeMetadata.categoryAuto */
  categoryAuto?: boolean;
}

export interface MetadataByPlatform {
  adobe: AdobeMetadata;
  shutterstock: ShutterstockMetadata;
}

export type Metadata = MetadataByPlatform[Platform];

export type MetadataFor<P extends Platform> = MetadataByPlatform[P];

// Slot per platform [BARU M4b]: ganti platform TIDAK menghapus hasil generate —
// UI/CSV/generate hanya membaca slot platform aktif (kosong = belum pernah digenerate).
export type MetadataSlots = { [P in Platform]?: MetadataFor<P> };

export interface Frame {
  id: number;
  name: string;
  thumb: string;
  tema: string;
  status: Record<Platform, FrameStatus>;   // mengikuti slot platform aktif; default 'menunggu'
  error: Record<Platform, string>;         // pesan gagal per platform
  metadata: MetadataSlots;
  // M29 (Mode Analisis): hasil + status/error analisis per platform — pola sama seperti
  // metadata/status/error di atas (per platform, tidak saling menimpa). Opsional supaya
  // sesi lama yang di-restore tetap terbaca (undefined = belum pernah dianalisis).
  analysis?: Partial<Record<Platform, AnalysisResult>>;
  analysisStatus?: Partial<Record<Platform, FrameStatus>>;
  analysisError?: Partial<Record<Platform, string>>;
}

// M29 — Mode Analisis (berdampingan dengan Mode Metadata, bukan pengganti).

/** Mode aplikasi: 'analisis' = nilai kelayakan upload, 'metadata' = buat metadata (default). */
export type AppMode = 'analisis' | 'metadata';

/** Hasil penilaian kelayakan upload satu frame untuk satu platform. */
export type AnalysisVerdict = 'layak' | 'berpotensi-ditolak' | 'perlu-tinjau';

export type AnalysisIssueCategory =
  | 'kualitas-gambar'
  | 'konten-serupa'
  | 'watermark-logo'
  | 'hak-cipta-merek'
  | 'properti-model-release'
  | 'komposisi'
  | 'nilai-komersial'
  | 'lainnya';

export interface AnalysisIssue {
  category: AnalysisIssueCategory;
  description: string;
}

export interface AnalysisResult {
  verdict: AnalysisVerdict;
  issues: AnalysisIssue[];
  summary: string;
}
