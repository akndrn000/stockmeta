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
}
