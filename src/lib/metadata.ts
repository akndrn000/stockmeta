// Slot metadata per platform: default, deteksi "berisi", dan gabungan hasil generate.
// Dipakai useSession (edit manual) & useBatch (hasil model) supaya aturan merge satu sumber.
import type { ParsedMetadata } from './prompt';
import type { AdobeMetadata, Metadata, Platform, ShutterstockMetadata } from './types';

export function defaultMetadata(platform: Platform): Metadata {
  return platform === 'adobe'
    ? { title: '', keywords: [], category: '' }
    : { description: '', keywords: [], categories: [] };
}

// Judul Adobe untuk CSV: koma adalah pemisah kolom → diganti spasi, spasi ganda dirapikan.
// Sengaja TIDAK dipotong di sini — kelebihan 70 karakter dikasih tahu lewat saran validasi.
export function cleanAdobeTitle(title: string): string {
  return title.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
}

export function hasContent(platform: Platform, m: Metadata): boolean {
  return platform === 'adobe'
    ? Boolean((m as AdobeMetadata).title || (m as AdobeMetadata).keywords.length || (m as AdobeMetadata).category)
    : Boolean(
        (m as ShutterstockMetadata).description ||
          (m as ShutterstockMetadata).keywords.length ||
          (m as ShutterstockMetadata).categories[0]
      );
}

// Port applyGeminiResult() legacy: judul/deskripsi HANYA ditimpa kalau model
// mengembalikannya (tidak pernah jadi kosong); keywords menimpa penuh kalau model
// mengembalikannya; kategori datang dari parser sudah ternormalisasi —
// Shutterstock satu nama → kategori baru berupa [nama].
export function mergeGenerated(platform: Platform, base: Metadata, incoming: ParsedMetadata): Metadata {
  if (platform === 'adobe') {
    const b = base as AdobeMetadata;
    return {
      title: incoming.title?.trim() ? incoming.title : b.title,
      keywords: incoming.keywords ?? b.keywords,
      category: incoming.category?.trim() ? incoming.category : b.category
    };
  }
  const b = base as ShutterstockMetadata;
  return {
    description: incoming.description?.trim() ? incoming.description : b.description,
    keywords: incoming.keywords ?? b.keywords,
    categories: incoming.category ? [incoming.category] : b.categories
  };
}
