// Penegakan SATU SUMBER KEBENARAN: angka batas platform (4, 5, 6, 7, 49, 50, 70,
// 200, 2048, 60, 5000) dilarang sebagai literal di luar platform-rules.ts (dan di
// luar *.test.ts). Komentar dan string dihapus dulu agar pesan UI yang memakai
// konstanta tidak ikut dihitung; pengecualian eksplisit dicatat di ALLOWLIST.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ADOBE_CATEGORIES,
  ADOBE_CSV_HEADER,
  ADOBE_KEYWORDS_MAX,
  ADOBE_KEYWORDS_MIN,
  ADOBE_TITLE_MAX,
  ADOBE_TITLE_SUGGEST_MAX,
  csvFileName,
  renderRulesBlock,
  RULE_IDS,
  RULES,
  sanitizeAdobeTitle,
  SHUTTERSTOCK_CATEGORIES,
  SHUTTERSTOCK_CSV_HEADER_BASE,
  SHUTTERSTOCK_CSV_OPTIONAL,
  SS_DESCRIPTION_MAX_CHARS,
  SS_DESCRIPTION_MIN_WORDS,
  SS_KEYWORDS_MAX,
  SS_KEYWORDS_MIN
} from './platform-rules';
import { findBrandHits } from './brands';

const SRC_ROOT = fileURLToPath(new URL('../', import.meta.url));

function allSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && e.name !== 'platform-rules.ts') out.push(p);
    }
  };
  walk(SRC_ROOT);
  return out;
}

/** buang komentar // /* *​/ agar angka di komentar tidak dihitung */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:"'/\w])\/\/.*$/gm, '$1');
}

/**
 * Buang ISI string literal ('…', "…", `…`) — class Tailwind seperti duration-200 /
 * opacity-60 bukan batas platform. Pesan UI wajib memakai konstanta via ${…},
 * sehingga literal batas di string tetap pelanggaran (tertangkap bila ditulis di
 * luar string, mis. perbandingan atau repeat(70)).
 */
function stripStrings(code: string): string {
  return code
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

interface AllowEntry {
  file: string;
  pattern: RegExp;
  reason: string;
}

/** literal yang SAMA ANGKAnya dengan batas platform tapi BUKAN batas platform */
const ALLOWLIST: AllowEntry[] = [
  {
    file: 'retry.ts',
    pattern: /5000 \* Math\.pow/,
    reason: 'backoff 5s→10s untuk 503/sibuk (milidetik), bukan batas keyword/platform'
  },
  {
    file: 'image.ts',
    pattern: /maxSize = 200/,
    reason: 'ukuran thumbnail preview (px), bukan batas judul Adobe'
  }
];

const MULTI = /(?<!\w)(49|50|70|200|2048|60|5000|1048576)(?!\w)/;
const SINGLE_CMP = /([<>]=?|===?|!==?)\s*['"]?[4567]\b|\b[4567]\s*[<>]=?/;

describe('platform-rules: tanpa angka batas hardcode di luar', () => {
  it('literal multi-digit batas tidak muncul di sumber non-test', () => {
    const bad: string[] = [];
    for (const file of allSources()) {
      const short = file.split(/[\\/]/).pop() as string;
      const code = stripStrings(stripComments(readFileSync(file, 'utf8')));
      const lines = code.split('\n');
      lines.forEach((line, i) => {
        // baris import/re-export dari platform-rules & limits memakai konstanta — lewati
        if (/from '.\/(platform-rules|limits)'/.test(line)) return;
        const m = line.match(MULTI);
        if (m) {
          const allowed = ALLOWLIST.some((a) => short === a.file && a.pattern.test(line));
          if (!allowed) bad.push(short + ':' + (i + 1) + ' → …' + line.trim().slice(0, 80));
        }
      });
    }
    expect(bad, 'angka batas hardcode di luar platform-rules.ts:\n' + bad.join('\n')).toEqual([]);
  });

  it('perbandingan literal 4/5/6/7 tidak muncul di src/lib non-test', () => {
    // Hanya pada identifier domain limit (keyword/title/deskripsi/kategori/unique) —
    // konstanta algoritmik intern (stemmer, panjang kata) bukan batas platform.
    const DOMAIN = /(keyword|title|descri|categor|unique)/i;
    const bad: string[] = [];
    for (const file of allSources()) {
      if (!file.replace(/\\/g, '/').includes('/lib/') || file.includes('/lib/providers/')) continue;
      const short = file.split(/[\\/]/).pop() as string;
      if (short === 'platform-rules.ts') continue;
      const code = stripComments(readFileSync(file, 'utf8'));
      code.split('\n').forEach((line, i) => {
        if (/from '.\/(platform-rules|limits)'/.test(line)) return;
        // abaikan angka di dalam string UI (pesan memakai konstanta via template)
        const noStrings = line.replace(/(['"`]).*?\1/g, '');
        if (DOMAIN.test(noStrings) && SINGLE_CMP.test(noStrings)) bad.push(short + ':' + (i + 1) + ' → ' + line.trim().slice(0, 80));
      });
    }
    expect(bad, 'perbandingan batas literal di src/lib:\n' + bad.join('\n')).toEqual([]);
  });
});

describe('platform-rules: isi', () => {
  it('22 RULE_ID minimal semuanya terdefinisi', () => {
    expect(RULE_IDS).toHaveLength(22);
    for (const id of RULE_IDS) expect(RULES[id].summary.length).toBeGreaterThan(0);
  });

  it('angka batas sesuai bukti portal', () => {
    expect(ADOBE_TITLE_SUGGEST_MAX).toBe(70);
    expect(ADOBE_TITLE_MAX).toBe(200);
    expect(ADOBE_KEYWORDS_MIN).toBe(5);
    expect(ADOBE_KEYWORDS_MAX).toBe(49);
    expect(SS_DESCRIPTION_MIN_WORDS).toBe(5);
    expect(SS_DESCRIPTION_MAX_CHARS).toBe(2048);
    expect(SS_KEYWORDS_MIN).toBe(7);
    expect(SS_KEYWORDS_MAX).toBe(50);
  });

  it('kategori Adobe 21 entri bernomor 1-21; Shutterstock 26 nama', () => {
    expect(ADOBE_CATEGORIES).toHaveLength(21);
    expect(ADOBE_CATEGORIES.map((c) => c.adobeNumber)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(SHUTTERSTOCK_CATEGORIES).toHaveLength(26);
  });

  it('header CSV persis template resmi', () => {
    expect([...ADOBE_CSV_HEADER]).toEqual(['Filename', 'Title', 'Keywords', 'Category', 'Releases']);
    expect([...SHUTTERSTOCK_CSV_HEADER_BASE]).toEqual(['Filename', 'Description', 'Keywords', 'Categories']);
    expect([...SHUTTERSTOCK_CSV_OPTIONAL]).toEqual(['Illustration', 'Mature content', 'Editorial']);
  });

  it('nama file CSV tanpa spasi', () => {
    expect(csvFileName('adobe', new Date(2026, 9, 4))).toBe('StockMeta_Adobe_2026-10-04.csv');
    expect(csvFileName('shutterstock', new Date(2026, 9, 4))).toBe('StockMeta_Shutterstock_2026-10-04.csv');
  });

  it('blok aturan juri memuat semua RULE_ID dan menandai item verify', () => {
    const expected: Record<'adobe' | 'shutterstock', readonly string[]> = {
      adobe: ['ADOBE_TITLE_LEN', 'ADOBE_TITLE_COMMA', 'ADOBE_TITLE_WORDS', 'ADOBE_KEYWORDS_RANGE', 'ADOBE_KEYWORDS_TITLE_WORDS', 'ADOBE_CATEGORY', 'TECH_DATA'],
      shutterstock: ['SS_DESC_LEN', 'SS_DESC_SENTENCE', 'SS_KEYWORDS_RANGE', 'SS_KEYWORDS_UNIQUE', 'SS_KEYWORDS_STEM', 'SS_CATEGORIES']
    };
    const shared = ['IP_BRAND', 'IP_PERSON_ARTIST_CHARACTER', 'AI_LABEL_IN_TEXT', 'LANGUAGE_EN', 'GROUNDING', 'CATEGORY_FIT', 'FILENAME_MATCH', 'RELEASE_NEEDED', 'IMAGE_QUALITY'];
    for (const platform of ['adobe', 'shutterstock'] as const) {
      const block = renderRulesBlock(platform);
      for (const id of [...expected[platform], ...shared]) {
        expect(block, platform + ' ' + id).toContain(id);
      }
      expect(block).toContain('belum pasti');
    }
  });

  it('sanitasi judul Adobe menandai perubahan', () => {
    expect(sanitizeAdobeTitle('Kucing merah di meja')).toEqual({ text: 'Kucing merah di meja', changed: false });
    const r = sanitizeAdobeTitle('Kucing, "merah"; lucu 😺');
    expect(r.changed).toBe(true);
    expect(r.text).not.toMatch(/[,;"😺]/);
  });

  it('pesan UI tidak menulis angka batas literal (pakai konstanta via ${…})', () => {
    // Tailwind (duration-200, opacity-60) tidak mengandung kata limit Indonesia,
    // jadi pola ini aman dari false positive class.
    const PHRASE = /(maks(imal|imum)?|min(imal|imum)?|batas)\D{0,40}\b(49|50|70|200|2048|60|5000)\b/i;
    const bad: string[] = [];
    for (const file of allSources()) {
      const short = file.split(/[\\/]/).pop() as string;
      const raw = readFileSync(file, 'utf8');
      const strings: string[] = [
        ...raw.matchAll(/'(?:[^'\\\n]|\\.)*'/g),
        ...raw.matchAll(/"(?:[^"\\\n]|\\.)*"/g),
        ...raw.matchAll(/`(?:[^`\\]|\\.)*`/g)
      ].map((m) => m[0]);
      strings.forEach((s, i) => {
        if (PHRASE.test(s)) bad.push(short + '#str' + i + ' → ' + s.slice(0, 80));
      });
    }
    expect(bad, 'pesan hardcode angka batas:\n' + bad.join('\n')).toEqual([]);
  });

  it('brands.ts menemukan merek umum', () => {
    expect(findBrandHits('Red sneakers with logo')).toEqual([]);
    expect(findBrandHits('Nike shoes on track')).toContain('Nike');
    expect(findBrandHits('pineapple juice')).toEqual([]);
  });
});
