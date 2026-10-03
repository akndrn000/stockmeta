// CSV sesuai template resmi (M9a, dikoreksi M24 — sumber di docs/MIGRATION.md):
// Adobe  = Filename, Title, Keywords, Category (NOMOR), Releases (kosong — fitur
// releases/model release di luar cakupan tools ini); Title maks 200 karakter dan BOLEH
// berkoma (setiap sel di-quote); Shutterstock = Filename, Description, Keywords,
// Categories (1-2 nama, satu sel).
// Hanya baris yang slot platform aktif berisi; judul TIDAK dipotong diam-diam
// (kelebihan 200 karakter jadi saran validasi). BOM UTF-8 + CRLF ada di downloadCsv.
import { ADOBE_CATEGORY_IDS } from './categories';
import { cleanAdobeTitle, hasContent } from './metadata';
import type { Frame, Platform } from './types';

export function buildCsv(frames: Frame[], platform: Platform): string {
  // Guard CSV-injection: sel berawalan = + - @ (atau tab/CR) dinetralkan dengan apostrof
  // supaya Excel/LibreOffice tidak mengeksekusi isinya sebagai formula.
  const q = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const rows: string[][] = [
    platform === 'adobe'
      ? ['Filename', 'Title', 'Keywords', 'Category', 'Releases']
      : ['Filename', 'Description', 'Keywords', 'Categories']
  ];
  for (const f of frames) {
    const m = f.metadata[platform];
    if (!m || !hasContent(platform, m)) continue;
    const kw = m.keywords.join(', ');
    if (platform === 'adobe') {
      rows.push([
        f.name,
        'title' in m ? cleanAdobeTitle(m.title) : '',
        kw,
        'category' in m ? String(ADOBE_CATEGORY_IDS[m.category] ?? '') : '',
        ''
      ]);
    } else {
      rows.push([
        f.name,
        'description' in m ? m.description : '',
        kw,
        'categories' in m ? m.categories.join(', ') : ''
      ]);
    }
  }
  return rows.map((r) => r.map(q).join(',')).join('\r\n');
}

export function downloadCsv(frames: Frame[], platform: Platform): void {
  if (!frames.length) return;
  const slug = platform === 'adobe' ? 'adobe-stock' : 'shutterstock';
  const blob = new Blob(['﻿' + buildCsv(frames, platform)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'stockmeta-' + slug + '-metadata.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
