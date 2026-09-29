// Khusus browser (canvas/FileReader) — tanpa tes unit.
// prepareImage: sisi terpanjang dipangkas ke 1280px, JPEG q0.8 (hemat token & kuota), base64
// murni (port legacy toBase64Part); makeThumbnail: preview kecil untuk riwayat sesi.
import type { ImageInput } from './providers/types';

/** sisi terpanjang maksimum gambar yang dikirim ke provider (px) */
export const MAX_IMAGE_SIDE = 1280;
/** kualitas JPEG saat diperkecil sebelum dikirim ke provider */
export const IMAGE_QUALITY = 0.8;

function readDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Gambar gagal dibaca'));
    r.readAsDataURL(file);
  });
}

async function rawImage(file: File): Promise<ImageInput> {
  const durl = await readDataURL(file);
  return { base64: durl.slice(durl.indexOf(',') + 1), mimeType: file.type || 'image/jpeg' };
}

export async function prepareImage(file: File): Promise<ImageInput> {
  let bmp: ImageBitmap | null = null;
  try { bmp = await createImageBitmap(file); }
  catch { bmp = null; }
  if (!bmp) return rawImage(file);   // tanpa jalur canvas: kirim file apa adanya

  const max = MAX_IMAGE_SIDE;         // sisi terpanjang 1280px → token lebih hemat, request lebih jarang gagal
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  if (!cx) {
    bmp.close();
    return rawImage(file);
  }
  cx.fillStyle = '#FFFFFF';
  cx.fillRect(0, 0, w, h);
  cx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const durl = cv.toDataURL('image/jpeg', IMAGE_QUALITY);
  return { base64: durl.slice(durl.indexOf(',') + 1), mimeType: 'image/jpeg' };
}

/** Preview JPEG kecil (data URL) untuk riwayat sesi; '' kalau gagal. */
export async function makeThumbnail(file: File, maxSize = 200): Promise<string> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d');
    if (!cx) {
      bmp.close();
      return '';
    }
    cx.fillStyle = '#EDECE8';
    cx.fillRect(0, 0, w, h);
    cx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return cv.toDataURL('image/jpeg', 0.7);
  } catch {
    return '';
  }
}
