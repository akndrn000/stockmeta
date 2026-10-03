// Slot metadata per platform: default, deteksi "berisi", dan gabungan hasil generate.
// Dipakai useSession (edit manual) & useBatch (hasil model) supaya aturan merge satu sumber.
import type { ParsedMetadata } from './prompt';
import type { AdobeMetadata, Metadata, Platform, ShutterstockMetadata } from './types';

export function defaultMetadata(platform: Platform): Metadata {
  return platform === 'adobe'
    ? { title: '', keywords: [], category: '' }
    : { description: '', keywords: [], categories: [] };
}

// Judul Adobe untuk CSV — M24 (koreksi M9a): koma TIDAK lagi dibersihkan. Contoh CSV
// resmi Adobe yang diverifikasi user membolehkan Title hingga 200 karakter, dan koma aman
// karena buildCsv meng-quote setiap sel dengan benar. Fungsi ini tinggal merapikan spasi.
// Sengaja TIDAK dipotong di sini — kelebihan 200 karakter dikasih tahu lewat saran validasi.
export function cleanAdobeTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
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
// M11: kategori fallback otomatis (categoryAuto) hanya dipakai kalau slot lama masih kosong —
// generate tanpa kategori tidak boleh menimpa pilihan yang sudah ada, dan benderanya ikut
// berpindah supaya saran "periksa kembali" tetap melekat pada isinya.
export function mergeGenerated(platform: Platform, base: Metadata, incoming: ParsedMetadata): Metadata {
  if (platform === 'adobe') {
    const b = base as AdobeMetadata;
    const auto = Boolean(incoming.categoryAuto);
    const old = b.category.trim() ? b.category : '';
    const categoryAuto = auto
      ? old ? b.categoryAuto : true
      : incoming.category?.trim() ? undefined : b.categoryAuto;
    const category = auto
      ? old || incoming.category || ''
      : incoming.category?.trim() ? incoming.category : b.category;
    return {
      title: incoming.title?.trim() ? incoming.title : b.title,
      keywords: incoming.keywords ?? b.keywords,
      category,
      ...(categoryAuto ? { categoryAuto } : {})
    };
  }
  const b = base as ShutterstockMetadata;
  const auto = Boolean(incoming.categoryAuto);
  const old = b.categories.length ? b.categories : [];
  const categoryAuto = auto
    ? old.length ? b.categoryAuto : true
    : incoming.category?.trim() ? undefined : b.categoryAuto;
  const categories = auto
    ? old.length ? b.categories : incoming.category ? [incoming.category] : b.categories
    : incoming.category ? [incoming.category] : b.categories;
  return {
    description: incoming.description?.trim() ? incoming.description : b.description,
    keywords: incoming.keywords ?? b.keywords,
    categories,
    ...(categoryAuto ? { categoryAuto } : {})
  };
}
