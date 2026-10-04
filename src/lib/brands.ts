// Daftar merek / perusahaan / produk umum untuk heuristik IP_BRAND (cek keras, tanpa AI).
// Sengaja daftar umum + mudah diperluas: tambah entri baru bila menemukan merek yang
// lolos. Pencocokan case-insensitive dengan batas kata; hasil selalu PERINGATAN
// non-pemblokir (bukan keputusan hukum — pengguna yang menilai).
export const BRANDS: readonly string[] = [
  'Nike', 'Adidas', 'Puma', 'Reebok', 'New Balance', 'Converse', 'Vans',
  'Apple', 'Samsung', 'Google', 'Microsoft', 'Sony', 'LG', 'Huawei', 'Xiaomi',
  'Canon', 'Nikon', 'Fujifilm', 'Panasonic', 'Olympus', 'Leica', 'GoPro',
  'Coca-Cola', 'Coke', 'Pepsi', 'Sprite', 'Fanta', 'Starbucks', 'McDonald\'s',
  'KFC', 'Burger King', 'Pizza Hut', 'Domino\'s', 'Nestle', 'Nestlé', 'Danone',
  'Toyota', 'Honda', 'Ford', 'BMW', 'Mercedes', 'Mercedes-Benz', 'Audi',
  'Volkswagen', 'Tesla', 'Hyundai', 'Kia', 'Yamaha', 'Suzuki',
  'Gucci', 'Louis Vuitton', 'Chanel', 'Hermes', 'Hermès', 'Prada', 'Zara', 'H&M',
  'IKEA', 'Lego', 'LEGO', 'Mattel', 'Barbie', 'Hot Wheels', 'Nintendo',
  'PlayStation', 'Xbox', 'Disney', 'Marvel', 'DC Comics', 'Pixar', 'Netflix',
  'Spotify', 'YouTube', 'Instagram', 'TikTok', 'Facebook', 'Twitter', 'X Corp',
  'Amazon', 'eBay', 'Alibaba', 'PayPal', 'Visa', 'Mastercard',
  'Nivea', 'L\'Oreal', 'L\'Oréal', 'Maybelline', 'Dove', 'Advil', 'Tylenol',
  'Red Bull', 'Monster Energy', 'Gatorade', 'Heineken', 'Budweiser',
  'Shell', 'BP', 'Exxon', 'Pertamina', 'Telkomsel', 'Indosat', 'XL Axiata'
];

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Temukan merek dari daftar yang muncul di teks (judul/keyword/deskripsi).
 * Kembalikan nama sesuai daftar (unik, urutan daftar). Batas kata dipakai agar
 * "apple" pada "pineapple" tidak cocok.
 */
export function findBrandHits(text: string): string[] {
  if (!text.trim()) return [];
  const hits: string[] = [];
  for (const brand of BRANDS) {
    const re = new RegExp('(?<![\\p{L}\\p{N}])' + escapeRegExp(brand) + '(?![\\p{L}\\p{N}])', 'iu');
    if (re.test(text)) hits.push(brand);
  }
  return hits;
}
