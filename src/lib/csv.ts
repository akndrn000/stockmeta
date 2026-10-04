// CSV sesuai template resmi (header persis, kolom opsional Shutterstock bersyarat):
// Adobe  = Filename, Title, Keywords, Category (NOMOR), Releases (kosong — fitur
// releases/model release di luar cakupan tools ini); Title DISANITASI (tanpa koma/
// kutip/emoji, terlihat di UI) dan TIDAK dipotong diam-diam (kelebihan 200 karakter
// = error cek keras, frame itu dilewati). Shutterstock = Filename, Description,
// Keywords, Categories + kolom opsional E-G bila ada frame mengaktifkan toggle.
// Hanya baris berisi & tanpa error cek keras yang diekspor; BOM UTF-8 + CRLF.
import { ADOBE_CATEGORY_IDS } from './categories';
import { hasContent } from './metadata';
import {
  ADOBE_CSV_HEADER,
  CSV_BOM_DEFAULT,
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
  SHUTTERSTOCK_CSV_HEADER_BASE,
  SHUTTERSTOCK_CSV_OPTIONAL,
  SHUTTERSTOCK_OPTIONAL_NO,
  SHUTTERSTOCK_OPTIONAL_YES,
  csvFileName,
  sanitizeAdobeTitle
} from './platform-rules';
import { validateMetadata, type ValidationIssue } from './validate';
import type { AdobeMetadata, Frame, Platform, ShutterstockMetadata } from './types';

// Guard CSV-injection: sel berawalan = + - @ (atau tab/CR) dinetralkan dengan apostrof
// supaya Excel/LibreOffice tidak mengeksekusi isinya sebagai formula.
function q(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return '"' + safe.replace(/"/g, '""') + '"';
}

/** nama file di portal (default = nama upload), dipakai apa adanya — jaga ejaan & ekstensi */
export function portalFileName(frame: Frame): string {
  return frame.portalName?.trim() || frame.name;
}

function shutterOptionalActive(frames: Frame[]): boolean {
  return frames.some((f) => f.illustration === true || f.editorial === true);
}

function ssRow(f: Frame, m: ShutterstockMetadata, withOptional: boolean): string[] {
  const row = [
    portalFileName(f),
    m.description,
    m.keywords.join(', '),
    m.categories.join(', ')
  ];
  if (withOptional) {
    row.push(
      f.illustration ? SHUTTERSTOCK_OPTIONAL_YES : SHUTTERSTOCK_OPTIONAL_NO,
      SHUTTERSTOCK_OPTIONAL_NO, // tanpa toggle "mature" — selalu No
      f.editorial ? SHUTTERSTOCK_OPTIONAL_YES : SHUTTERSTOCK_OPTIONAL_NO
    );
  }
  return row;
}

export interface SkippedFrame {
  frame: Frame;
  errors: ValidationIssue[];
}

export interface CsvPlan {
  filename: string;
  header: string[];
  /** baris data (tanpa header), sudah quoting RFC 4180 */
  lines: string[];
  csv: string;
  /** byte dengan BOM (yang sebenarnya diunduh) */
  bytes: number;
  overBytes: boolean;
  overRows: boolean;
  exportable: Frame[];
  skipped: SkippedFrame[];
  warnCount: number;
}

/** Rencana ekspor: filter isi + cek keras; error = frame dilewati (peringatan juri tidak memblokir). */
export function planCsv(frames: Frame[], platform: Platform): CsvPlan {
  const withContent = frames.filter((f) => {
    const m = f.metadata[platform];
    return m !== undefined && hasContent(platform, m);
  });
  const exportable: Frame[] = [];
  const skipped: SkippedFrame[] = [];
  let warnCount = 0;
  for (const f of withContent) {
    const m = f.metadata[platform];
    if (!m) continue;
    const r = validateMetadata(platform, m, portalFileName(f));
    warnCount += r.warnings.length;
    if (r.errors.length) skipped.push({ frame: f, errors: r.errors });
    else exportable.push(f);
  }
  const withOptional = platform === 'shutterstock' && shutterOptionalActive(exportable);
  const header = platform === 'adobe'
    ? [...ADOBE_CSV_HEADER]
    : [...SHUTTERSTOCK_CSV_HEADER_BASE, ...(withOptional ? [...SHUTTERSTOCK_CSV_OPTIONAL] : [])];
  const lines = exportable.map((f) => {
    const m = f.metadata[platform];
    if (platform === 'adobe') {
      const a = m as AdobeMetadata;
      return [portalFileName(f), sanitizeAdobeTitle(a.title).text, a.keywords.join(', '),
        'category' in a ? String(ADOBE_CATEGORY_IDS[a.category] ?? '') : '', ''];
    }
    return ssRow(f, m as ShutterstockMetadata, withOptional);
  }).map((r) => r.map(q).join(','));
  const csv = [header.map(q).join(','), ...lines].join('\r\n');
  const bytes = new TextEncoder().encode('﻿' + csv).length;
  return {
    filename: csvFileName(platform),
    header,
    lines,
    csv,
    bytes,
    overBytes: bytes > CSV_MAX_BYTES,
    overRows: exportable.length > CSV_MAX_ROWS,
    exportable,
    skipped,
    warnCount
  };
}

export function buildCsv(frames: Frame[], platform: Platform): string {
  return planCsv(frames, platform).csv;
}

export function downloadCsv(frames: Frame[], platform: Platform, opts?: { bom?: boolean; filename?: string }): void {
  if (!frames.length) return;
  const bom = opts?.bom ?? CSV_BOM_DEFAULT;
  const blob = new Blob([(bom ? '﻿' : '') + buildCsv(frames, platform)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = opts?.filename ?? csvFileName(platform);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
