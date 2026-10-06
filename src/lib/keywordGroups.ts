// M34 — pasca-proses keyword berbasis sumber. Fungsi murni, tanpa React/DOM.
// Format model: {k, src, of?, rel?, kind?, standalone?} dengan src visible|
// attribute|synonym(of+rel wajib)|theme(kind wajib)|usage. Aturan: satu kata
// default; frasa dua kata baku ≤ KEYWORD_PHRASE_MAX; frasa tiga kata ≤
// KEYWORD_PHRASE3_MAX dan hanya bila persis nama objek/bagian pengamatan atau
// subjek judul. Tanpa latar; tanpa anatomi generik (kecuali subjek utama).
// Potongan tak bermakna (komponen frasa) dibuang kecuali subjek/tema/
// tercatat-sendiri/standalone (dinilai Tahap D). Kembar per frasa: maksimal
// satu komponen tersisa. Urutan komersial: frasa subjek di posisi 1, inti
// tema di 2–3, benda sekunder ≤3 di 10 teratas, lalu media, gaya, sinonim,
// tema, usage, warna. Tanpa hardcode nama tema.
import {
  ANATOMY_STOPLIST,
  BACKGROUND_STOPLIST,
  COLOR_WORDS,
  GENERIC_FILLER_WORDS,
  GENERIC_TAIL_MAX,
  GENERIC_TAIL_WORDS,
  KEYWORD_COLOR_MAX,
  KEYWORD_MEDIA_MAX,
  KEYWORD_PHRASE_MAX,
  KEYWORD_PHRASE_WORDS_MAX,
  KEYWORD_PHRASE3_MAX,
  KEYWORD_TARGET_MAX,
  KEYWORD_THEME_TOKEN_OVERLAP_MAX,
  KEYWORD_TOKEN_OVERLAP_MAX,
  KEYWORD_USAGE_MAX,
  LOW_VALUE_DESCRIPTORS,
  MAX_KEYWORDS,
  MAX_KEYWORDS_ADOBE,
  MEDIA_ONLY_USAGE,
  MEDIA_WORDS,
  ORPHAN_HEAD_STOPLIST,
  PLATFORM_TOP_KEYWORDS,
  SPECIFIC_CLAIM_WORDS,
  THEME_CONCEPT_MAX
} from './limits';
import { isIndonesianKeyword } from './language';
import type { ImageObservation, KeywordRel, KeywordSrc, KeywordThemeKind, SourcedKeyword } from './prompt';
import type { Platform } from './types';

export type { KeywordSrc };

const BG = new Set(BACKGROUND_STOPLIST.map((w) => w.toLowerCase()));
const LOW = new Set(LOW_VALUE_DESCRIPTORS.map((w) => w.toLowerCase()));
const FILLER = new Set(GENERIC_FILLER_WORDS.map((w) => w.toLowerCase()));
const MEDIA = new Set(MEDIA_WORDS.map((w) => w.toLowerCase()));
const ANATOMY = new Set(ANATOMY_STOPLIST.map((w) => w.toLowerCase()));
const MEDIA_ONLY = new Set(MEDIA_ONLY_USAGE.map((w) => w.toLowerCase()));
const ORPHAN_HEAD = new Set(ORPHAN_HEAD_STOPLIST.map((w) => w.toLowerCase()));
const COLOR = new Set(COLOR_WORDS.map((w) => w.toLowerCase()));
const CLAIM = new Set(SPECIFIC_CLAIM_WORDS.map((w) => w.toLowerCase()));
const GENTAIL = new Set(GENERIC_TAIL_WORDS.map((w) => w.toLowerCase()));

const VALID_SRC: readonly string[] = ['visible', 'attribute', 'synonym', 'theme', 'usage'];
const VALID_REL: readonly string[] = ['synonym', 'parent', 'specific'];
const VALID_KIND: readonly string[] = ['event', 'season', 'mood', 'activity', 'usage'];

function norm(s: string): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function low(s: string): string {
  return norm(s).toLowerCase();
}

/** Stem sederhana untuk dedupe: lowercase + strip plural -s/-es. */
export function stemKeyword(s: string): string {
  const l = low(s);
  if (l.length > 5 && l.endsWith('es')) return l.slice(0, -2);
  if (l.length > 4 && l.endsWith('s')) return l.slice(0, -1);
  return l;
}

/** Samakan bentuk untuk pencocokan: huruf kecil, tanpa non-huruf. */
function squash(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');
}

/** true bila kata ada di himpunan (cocok persis atau via stem). */
function inSet(set: Set<string>, word: string): boolean {
  const w = low(word);
  return set.has(w) || set.has(stemKeyword(w));
}

/** Token pengamatan → himpunan kata (squash) untuk grounding. */
export function observationWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of String(text ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean)) {
    out.add(t);
    out.add(squash(t));
  }
  return out;
}

/**
 * Teks grounding dari observasi: gabungan objects/parts/patterns/materials/
 * shapes/styles/moods/usages/colors. Latar (background) dan komposisi sudut
 * pandang SENGAJA tidak ikut — tidak dipakai untuk keyword (M32).
 */
export function observationGroundingText(obs?: {
  objects?: string[]; parts?: string[]; patterns?: string[]; materials?: string[];
  shapes?: string[]; styles?: string[]; moods?: string[]; usages?: string[];
  colors?: string[];
  /** Diterima tapi diabaikan: latar & komposisi tidak dipakai untuk keyword. */
  background?: string; composition?: string[];
}): string {
  if (!obs) return '';
  return [
    ...(obs.objects ?? []), ...(obs.parts ?? []), ...(obs.patterns ?? []),
    ...(obs.materials ?? []), ...(obs.shapes ?? []), ...(obs.styles ?? []),
    ...(obs.moods ?? []), ...(obs.usages ?? []), ...(obs.colors ?? [])
  ].join(' ');
}

const squashSet = (list: string[] = []): Set<string> =>
  new Set(list.map((x) => squash(x)).filter(Boolean));

/**
 * Teks fakta visual untuk grounding: observation (tanpa latar/komposisi) +
 * visible_facts AI. Satu-satunya dasar warna dan klaim spesifik.
 */
export function factsText(obs?: ImageObservation, visibleFacts?: string[]): string {
  const base = observationGroundingText(obs);
  const extra = (visibleFacts ?? []).map((s) => String(s ?? '').trim()).filter(Boolean).join(' ');
  return extra ? base + ' ' + extra : base;
}

/** Himpunan kata fakta (kecil + squash) untuk pencocokan kata utuh. */
export function factWordSet(obs?: ImageObservation, visibleFacts?: string[]): Set<string> {
  return observationWords(factsText(obs, visibleFacts));
}

/** true bila keyword generik-ekor: kata tunggal generik, atau frasa yang semua
 *  katanya generik/media/warna dengan minimal satu kata generik. */
function isTailGeneric(k: string): boolean {
  const toks = String(k ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return toks.length > 0
    && toks.some((w) => inSet(GENTAIL, w))
    && toks.every((w) => inSet(GENTAIL, w) || inSet(MEDIA, w) || inSet(COLOR, w));
}

/** Warna pertama di teks yang tak ada utuh di fakta (tanpa peduli huruf), atau null. */
export function titleColorIssue(text: string, words: Set<string>): string | null {
  for (const w of String(text ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean)) {
    if (inSet(COLOR, w) && !words.has(w) && !words.has(squash(w)) && !words.has(stemKeyword(w))) {
      return w;
    }
  }
  return null;
}

/** Hapus kata warna tanpa dasar dari judul/deskripsi (deterministik, pasca-retry). */
export function stripUngroundedColorWords(
  text: string,
  words: Set<string>
): { text: string; removed: string[] } {
  const removed: string[] = [];
  const kept = String(text ?? '')
    .split(/(\s+)/)
    .filter((seg) => {
      if (/^\s*$/.test(seg)) return true;
      const w = seg.toLowerCase().replace(/[^a-z]/g, '');
      if (w && inSet(COLOR, w) && !words.has(w) && !words.has(squash(w)) && !words.has(stemKeyword(w))) {
        if (!removed.includes(w)) removed.push(w);
        return false;
      }
      return true;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const out = kept && removed.length ? kept.charAt(0).toUpperCase() + kept.slice(1) : kept;
  return { text: out, removed };
}

/** Instruksi retry perbaikan warna judul (digabung dengan alasan retry lain). */
export function colorRetryNote(color: string): string {
  return `Perbaikan judul: warna '${color}' tidak ada di fakta visual`
    + ' — tulis ulang judul/deskripsi HANYA dengan warna yang tertulis di'
    + ' visible_facts, tanpa menambah warna lain. Keyword yang sudah benar jangan diubah.';
}

export interface ProcessInput {
  sourced: SourcedKeyword[];
  obs?: ImageObservation;
  /** Fakta visual AI (ditulis sebelum keyword); digabung dengan obs untuk grounding. */
  visibleFacts?: string[];
  /** Kata inti theme_canonical (sudah dinormalisasi pemanggil bila perlu). */
  canonical: string;
  themeFit: boolean;
  themeEvidence: string;
  /** Jenis media pengamatan, mis. "photo" / "vector illustration". */
  mediaType: string;
  platform: Platform;
  /** Teks judul/deskripsi (untuk frasa tiga kata = subjek judul + kata judul). */
  titleText?: string;
}

export interface ProcessItem {
  k: string;
  src: KeywordSrc;
  rel?: KeywordRel;
  kind?: KeywordThemeKind;
  /** Status standalone model (satu kata): dinilai Tahap D. */
  standalone?: boolean;
}

export interface ProcessResult {
  /** Final terurut komersial + info sumber per kata (untuk live-test). */
  items: ProcessItem[];
  keywords: string[];
  removed: string[];
  /** Peringatan non-pemblokir untuk "Saran perbaikan" (satu per buang/pindah). */
  warnings: string[];
  srcCounts: Record<KeywordSrc, number>;
  themeMismatch: boolean;
}

const platformMax = (p: Platform): number => (p === 'adobe' ? MAX_KEYWORDS_ADOBE : MAX_KEYWORDS);

function canonicalTokens(canonical: string): string[] {
  return String(canonical ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

function titleTokens(titleText: string): Set<string> {
  return new Set(
    String(titleText ?? '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3)
  );
}

/** Kata judul untuk gerbang frasa: semua token kecuali artikel (a/an/the). */
function titleGateWords(titleText: string): Set<string> {
  return new Set(
    String(titleText ?? '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w && !['a', 'an', 'the'].includes(w))
  );
}

/**
 * Verifikasi + urutkan keyword bersumber. `phraseMax` menimpa
 * KEYWORD_PHRASE_MAX, `wordsMax` menimpa KEYWORD_PHRASE_WORDS_MAX, `phrase3Max`
 * menimpa KEYWORD_PHRASE3_MAX (untuk tes nilai 0/2/8).
 */
export function processSourcedKeywords(
  input: ProcessInput,
  opts?: { phraseMax?: number; wordsMax?: number; phrase3Max?: number }
): ProcessResult {
  const phraseMax = opts?.phraseMax ?? KEYWORD_PHRASE_MAX;
  const wordsMax = opts?.wordsMax ?? KEYWORD_PHRASE_WORDS_MAX;
  const phrase3Max = opts?.phrase3Max ?? KEYWORD_PHRASE3_MAX;
  const removed: string[] = [];
  const warnings: string[] = [];
  const obs = factWordSet(input.obs, input.visibleFacts);
  const objects = squashSet(input.obs?.objects);
  const moods = squashSet([...(input.obs?.moods ?? []), ...(input.obs?.styles ?? [])]);
  const colors = squashSet(input.obs?.colors);
  // Nama multi-kata di pengamatan (objects/parts): untuk aturan frasa utuh.
  const obsNames = squashSet([...(input.obs?.objects ?? []), ...(input.obs?.parts ?? [])]);
  const obsNameWords = (name: string): string[] =>
    String(name ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  // Item observasi yang tercatat SENDIRI (satu kata utuh).
  const obsSingles = new Set<string>();
  for (const list of [
    input.obs?.objects, input.obs?.parts, input.obs?.patterns, input.obs?.materials,
    input.obs?.shapes, input.obs?.styles, input.obs?.moods, input.obs?.usages,
    input.obs?.colors
  ]) {
    for (const item of list ?? []) {
      const toks = obsNameWords(item);
      if (toks.length === 1) obsSingles.add(toks[0]);
    }
  }
  const mediaWords = new Set(
    String(input.mediaType ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean)
  );
  const inMediaType = (k: string): boolean =>
    [...mediaWords].some((w) => w === low(k) || w === stemKeyword(k));
  const canon = new Set(canonicalTokens(input.canonical));
  const titleSet = titleTokens(input.titleText ?? '');
  const gateWords = titleGateWords(input.titleText ?? '');
  const themeOk = input.themeFit && norm(input.themeEvidence) !== '';
  // Kata-kata tema mentah (untuk komponen frasa): semua kata item theme.
  const themeWords = new Set<string>();
  // Frasa di daftar keyword respons (untuk aturan potongan): semua nama >1 kata.
  const responsePhrases = new Map<string, string[]>();
  for (const item of input.sourced ?? []) {
    const toks = String(item?.k ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
    if (String(item?.src ?? '').toLowerCase() === 'theme') {
      for (const w of toks) {
        themeWords.add(w);
        themeWords.add(squash(w));
      }
    }
    if (toks.length > 1) responsePhrases.set(toks.join(' '), toks);
  }

  interface Kept extends ProcessItem { isMedia: boolean; isColor: boolean; isPhrase: boolean; isTail: boolean }
  const kept: Kept[] = [];
  const seenStem = new Set<string>();

  /** true bila kata tunggal = komponen sebuah frasa (di daftar/tajuk obs). */
  const isOrphanComponent = (w: string): boolean => {
    const lw = low(w);
    for (const toks of responsePhrases.values()) {
      if (toks.includes(lw)) return true;
    }
    for (const name of [...(input.obs?.objects ?? []), ...(input.obs?.parts ?? [])]) {
      if (obsNameWords(name).includes(lw) && obsNameWords(name).length > 1) return true;
    }
    return false;
  };

  for (const item of input.sourced ?? []) {
    const raw = typeof item?.k === 'string' ? item.k : '';
    // a) tanpa src valid → buang (dilarang mengarang).
    const src = typeof item?.src === 'string' ? item.src.toLowerCase() : '';
    if (!VALID_SRC.includes(src)) {
      if (raw !== undefined) removed.push(String(raw));
      continue;
    }
    const s = src as KeywordSrc;
    // Normalisasi: trim + lowercase; di atas wordsMax selalu dibuang.
    const v = norm(raw).toLowerCase();
    const words = v.split(' ').filter(Boolean);
    if (!words.length || words.length > wordsMax) {
      if (String(raw ?? '').trim()) removed.push(String(raw));
      continue;
    }
    // Frasa butuh phraseMax > 0 (0 = satu kata penuh).
    if (words.length > 1 && phraseMax <= 0) {
      removed.push(String(raw));
      continue;
    }
    const k = words.join(' ');
    if (isIndonesianKeyword(k)) {
      removed.push(raw);
      continue;
    }
    const isPhrase = words.length > 1;
    const isPhrase3 = words.length === 3;
    // M34 Fase 1a — frasa tiga kata HANYA bila persis nama objek/bagian
    // pengamatan atau subjek judul (semua kata di judul).
    if (isPhrase3) {
      const isObsName = obsNames.has(squash(k));
      const isTitleSubject = words.every((w) => gateWords.has(low(w)));
      if (!isObsName && !isTitleSubject) {
        removed.push(raw);
        continue;
      }
    }
    // b) latar + anatomi generik tak boleh muncul — bahkan di dalam frasa.
    // Anatomi dikecualikan hanya bila kata tunggal = subjek utama (objects).
    // Frasa yang memuat kata ORPHAN_HEAD harus persis nama observasi.
    const badWord = (w: string): boolean => {
      if (inSet(BG, w) || inSet(LOW, w)) return true;
      if (inSet(ANATOMY, w) && !(words.length === 1 && objects.has(squash(w)))) return true;
      return false;
    };
    if (words.some(badWord)) {
      removed.push(raw);
      continue;
    }
    // Frasa beranggota ORPHAN_HEAD harus persis nama observasi — atau subjek
    // judul (semua kata di judul). Contoh: "gift box" lolos bila tercatat.
    const titleSubjectPhrase = isPhrase && words.every((w) => gateWords.has(low(w)));
    if (isPhrase && words.some((w) => inSet(ORPHAN_HEAD, w)) && !obsNames.has(squash(k)) && !titleSubjectPhrase) {
      removed.push(raw);
      continue;
    }
    // Kata pengisi generik: hanya bila tercatat di media_type. Kata
    // generik-ekor dikecualikan — demosi deterministik ke akhir, bukan hapus.
    const tailGeneric = isTailGeneric(k);
    const filler = !isPhrase && inSet(FILLER, k);
    if (!tailGeneric && filler && !inMediaType(k)) {
      removed.push(raw);
      continue;
    }
    const isMedia = (!isPhrase && inSet(MEDIA, k)) || (filler && inMediaType(k));
    // Kata media (murni) hanya dari media_type pengamatan.
    if (!tailGeneric && !isPhrase && inSet(MEDIA, k) && !inMediaType(k)) {
      removed.push(raw);
      continue;
    }
    // rel/kind diperketat (M33 Fase 2a/b).
    const relRaw = typeof item?.rel === 'string' ? item.rel.toLowerCase() : '';
    const kindRaw = typeof item?.kind === 'string' ? item.kind.toLowerCase() : '';
    const rel = (VALID_REL as readonly string[]).includes(relRaw) ? (relRaw as KeywordRel) : undefined;
    const kind = (VALID_KIND as readonly string[]).includes(kindRaw) ? (kindRaw as KeywordThemeKind) : undefined;
    const standalone = item?.standalone === true;
    // Gerbang warna: setiap kata warna harus utuh di fakta visual. Frasa tiga
    // kata dikecualikan — sudah dijaga gerbang nama-observasi/subjek-judul
    // (judulnya sendiri ditangani retry/strip warna).
    const missingColor = words.length < 3
      ? words.filter((w) => inSet(COLOR, w)).find((w) => {
        const lw = low(w);
        return !obs.has(lw) && !obs.has(squash(w)) && !obs.has(stemKeyword(w));
      })
      : undefined;
    if (missingColor) {
      removed.push(raw);
      warnings.push(`Kata kunci '${raw}' dibuang: warna '${low(missingColor)}' tidak ada di fakta visual.`);
      continue;
    }
    // Gerbang klaim spesifik: wajib terlihat di fakta visual, kecuali sinonim
    // terverifikasi (of ada di pengamatan + rel valid).
    const claimHit = words.find((w) => {
      if (!inSet(CLAIM, w)) return false;
      const lw = low(w);
      return !obs.has(lw) && !obs.has(squash(w)) && !obs.has(stemKeyword(w));
    });
    if (claimHit && !(s === 'synonym' && rel !== undefined)) {
      removed.push(raw);
      warnings.push(`Kata kunci '${raw}' dibuang: '${low(claimHit)}' tidak terlihat di fakta visual.`);
      continue;
    }
    // c) grounding per src (kata media/pengisi-media/generik-ekor dikecualikan).
    const grounded = (w: string): boolean =>
      obs.has(low(w)) || obs.has(squash(w)) || obs.has(stemKeyword(w));
    if (!isMedia && !tailGeneric && (s === 'visible' || s === 'attribute')) {
      // Gerbang subjek-judul melewati grounding (komponennya belum tentu di obs).
      const ok =
        (isPhrase3 && titleSubjectPhrase) ||
        (isPhrase
          ? words.every((w) => grounded(w) || canon.has(low(w)) || canon.has(squash(w)) || themeWords.has(low(w)))
          : grounded(k));
      if (!ok) {
        removed.push(raw);
        continue;
      }
    } else if (!isMedia && s === 'synonym') {
      // synonym: "of" wajib ada di pengamatan + rel wajib valid.
      if (!rel) {
        removed.push(raw);
        continue;
      }
      const of = norm(item?.of ?? '');
      const ofToks = of.toLowerCase().split(/[^a-z]+/).filter(Boolean);
      if (!ofToks.length || !ofToks.every((t) => obs.has(t) || obs.has(squash(t)))) {
        removed.push(raw);
        continue;
      }
    } else if (s === 'theme') {
      // theme: kind valid + fit + evidence (konsep abstrak dinilai Tahap D).
      if (!kind || !themeOk) {
        removed.push(raw);
        continue;
      }
    } else if (s === 'usage') {
      // usage MEDIA_ONLY (sticker/poster/greeting/...) hanya untuk ilustrasi/vektor.
      if (inSet(MEDIA_ONLY, k) || words.some((w) => inSet(MEDIA_ONLY, w))) {
        const illVec = [...mediaWords].some((w) => w === 'illustration' || w === 'vector');
        if (!illVec) {
          removed.push(raw);
          continue;
        }
      }
    }
    // M34 Fase 1c — potongan tak bermakna: kata tunggal komponen sebuah frasa
    // dibuang, kecuali subjek utama / inti tema / tercatat-sendiri / defer
    // standalone (keputusan akhir di Tahap D).
    if (!isPhrase && isOrphanComponent(k)) {
      const subjectMain = objects.has(squash(k));
      const themeCore = canon.has(low(k)) || canon.has(squash(k));
      const recordedAlone = obsSingles.has(low(k));
      if (!subjectMain && !themeCore && !recordedAlone && !standalone) {
        removed.push(raw);
        continue;
      }
    }
    // Dedupe stem per token (stabil: yang pertama menang; singular/plural
    // dianggap sama — "cats" vs "cat", "black cats" vs "black cat"). Kunci
    // mempertahankan digit (squash membuangnya — "fest0" vs "fest1" berbeda).
    const key = words.map((w) => stemKeyword(w)).join('');
    if (seenStem.has(key) || seenStem.has(stemKeyword(k))) {
      removed.push(raw);
      continue;
    }
    seenStem.add(key);
    seenStem.add(stemKeyword(k));
    kept.push({
      k,
      src: s,
      ...(rel ? { rel } : {}),
      ...(s === 'theme' && kind ? { kind } : {}),
      ...(standalone ? { standalone: true as const } : {}),
      isMedia,
      isColor: !isPhrase && colors.has(squash(k)),
      isPhrase,
      isTail: tailGeneric
    });
  }

  // Batas per sumber: tema ≤ THEME_CONCEPT_MAX, usage ≤ KEYWORD_USAGE_MAX,
  // frasa ≤ phraseMax, frasa-3 ≤ phrase3Max, media ≤ KEYWORD_MEDIA_MAX,
  // warna ≤ KEYWORD_COLOR_MAX.
  const overCap = (list: Kept[], n: number): Kept[] => {
    for (const x of list.slice(n)) removed.push(x.k);
    return list.slice(0, n);
  };
  const themeAll = kept.filter((x) => x.src === 'theme');
  const themeKept = new Set(overCap(themeAll, THEME_CONCEPT_MAX).map((x) => x.k));
  const usageKept = new Set(
    overCap(kept.filter((x) => x.src === 'usage'), KEYWORD_USAGE_MAX).map((x) => x.k)
  );
  const phraseAll = kept.filter((x) => x.isPhrase);
  const phraseKept = new Set(overCap(phraseAll, phraseMax).map((x) => x.k));
  const phrase3Kept = new Set(
    overCap(
      kept.filter((x) => x.k.split(' ').length === 3),
      phrase3Max
    ).map((x) => x.k)
  );
  const pool = kept.filter(
    (x) =>
      (x.src !== 'theme' || themeKept.has(x.k)) &&
      (x.src !== 'usage' || usageKept.has(x.k)) &&
      (!x.isPhrase || phraseKept.has(x.k)) &&
      (x.k.split(' ').length !== 3 || phrase3Kept.has(x.k))
  );
  // M34 Fase 1d — kembar: untuk satu frasa, maksimal SATU komponennya boleh
  // tersisa sebagai keyword terpisah (yang pertama urutan model menang).
  // Subjek utama dan inti tema dilindungi (tak pernah dibuang aturan ini).
  const twinDrop = new Set<string>();
  const isProtected = (k: string): boolean =>
    objects.has(squash(k)) || canon.has(low(k)) || canon.has(squash(k));
  for (const p of pool.filter((x) => x.isPhrase)) {
    const comps = p.k.split(' ');
    const survivors = pool.filter(
      (x) => !x.isPhrase && comps.includes(x.k) && !twinDrop.has(x.k) && !isProtected(x.k)
    );
    for (const extra of survivors.slice(1)) {
      twinDrop.add(extra.k);
      removed.push(extra.k);
    }
  }
  const pool2 = pool.filter((x) => !twinDrop.has(x.k));
  // Tumpang tindih: paling banyak KEYWORD_TOKEN_OVERLAP_MAX keyword memuat token
  // yang sama (token tema inti: KEYWORD_THEME_TOKEN_OVERLAP_MAX). Kelebihan dibuang
  // dari urutan paling bawah (urutan model), dengan peringatan.
  const tokenCounts = new Map<string, number>();
  const pool3 = pool2.filter((x) => {
    const toks = x.k.split(' ').map((w) => stemKeyword(low(w)));
    const cap = (t: string): number => (canon.has(t) || canon.has(squash(t))
      ? KEYWORD_THEME_TOKEN_OVERLAP_MAX
      : KEYWORD_TOKEN_OVERLAP_MAX);
    const over = toks.find((t) => (tokenCounts.get(t) ?? 0) >= cap(t));
    if (over) {
      removed.push(x.k);
      warnings.push(`Kata kunci '${x.k}' dibuang: terlalu banyak kata memakai '${over}'.`);
      return false;
    }
    for (const t of toks) tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 1);
    return true;
  });
  const mediaSet = new Set(
    overCap(pool3.filter((x) => x.isMedia), KEYWORD_MEDIA_MAX).map((x) => x.k)
  );
  const colorSet = new Set(
    overCap(pool3.filter((x) => x.isColor && !mediaSet.has(x.k)), KEYWORD_COLOR_MAX).map((x) => x.k)
  );

  // M34 Fase 2 — urutan komersial stabil: frasa subjek di posisi 1, inti tema
  // di 2–3, benda sekunder ≤3 di 10 teratas, lalu media, gaya, sinonim, tema,
  // usage, warna. Kata judul di 10 teratas.
  const isSubject = (x: Kept): boolean => x.src === 'visible' && objects.has(squash(x.k));
  const isThemeCore = (x: Kept): boolean => x.src === 'theme' && canon.has(squash(x.k));
  const isMood = (x: Kept): boolean => x.src === 'attribute' && moods.has(squash(x.k));
  const isElement = (x: Kept): boolean =>
    !x.isMedia &&
    !x.isColor &&
    (x.src === 'visible' ||
      (x.src === 'attribute' && !isMood(x))) &&
    !isSubject(x) &&
    !isThemeCore(x);
  const rank = (x: Kept): number => {
    if (isSubject(x)) return 0;
    if (isThemeCore(x)) return 1;
    if (isElement(x)) return 2;
    if (x.isMedia) return 3;
    if (isMood(x)) return 4;
    if (x.src === 'synonym') return 5;
    if (x.src === 'theme') return 6;
    if (x.src === 'usage') return 7;
    return 8;
  };
  const ordered = pool3
    .filter((x) => (x.isMedia ? mediaSet.has(x.k) : true))
    .filter((x) => (x.isColor && !x.isMedia ? colorSet.has(x.k) : true))
    .sort((a, b) => rank(a) - rank(b));
  // Benda sekunder tunggal (rank 2, bukan frasa) di 10 teratas maksimal 3 —
  // selebihnya pindah ke 11+ (setelah sisa urutan). Frasa dikecualikan: kompon
  // bernilai tinggi seperti kostum ("bat wings") tidak dihitung dalam cap ini.
  const first10 = ordered.slice(0, 10);
  const rest = ordered.slice(10);
  const isSingleSecondary = (x: Kept): boolean => rank(x) === 2 && !x.isPhrase;
  const secondaryIn10 = first10.filter(isSingleSecondary);
  let balanced = ordered;
  if (secondaryIn10.length > 3) {
    const keep = new Set(secondaryIn10.slice(0, 3).map((x) => x.k));
    const move = first10.filter((x) => isSingleSecondary(x) && !keep.has(x.k));
    const moveSet = new Set(move.map((x) => x.k));
    balanced = [...first10.filter((x) => !moveSet.has(x.k)), ...rest, ...move];
  }
  // Kata judul (konten, >3 huruf) harus ada di 10 teratas — tukar posisi dengan
  // item di 5..9 bila ada di final tetapi tenggelam. Swap (bukan insert) agar
  // komposisi 10 teratas stabil; indeks 0–4 (subjek/inti) tidak pernah digeser.
  // Prioritas bila konflik dengan cap sekunder: kata judul menang.
  for (const w of titleSet) {
    const in10 = (list: Kept[]): boolean =>
      list.slice(0, 10).some((x) => x.k === w || x.k.split(' ').includes(w));
    if (in10(balanced)) continue;
    const idx = balanced.findIndex((x) => x.k === w || x.k.split(' ').includes(w));
    if (idx <= 9) continue;
    let swapAt = -1;
    for (let i = 9; i >= 5; i--) {
      if (rank(balanced[i]) >= 2) {
        swapAt = i;
        break;
      }
    }
    if (swapAt < 0) continue;
    const [item] = balanced.splice(idx, 1);
    balanced.splice(swapAt, 0, item);
    const [evicted] = balanced.splice(swapAt + 1, 1);
    balanced.splice(idx, 0, evicted);
  }
  // Kata generik-ekor ke akhir (reorder deterministik, bukan hapus): daftar
  // lebih panjang dari slot teratas platform → generik pindah setelah slot
  // teratas, warna identitas tetap paling akhir. Maksimal GENERIC_TAIL_MAX
  // generik non-tema dipertahankan, sisanya dibuang dengan peringatan.
  const top = PLATFORM_TOP_KEYWORDS[input.platform];
  let tailPartitioned = balanced;
  if (balanced.length > top) {
    const head: Kept[] = [];
    const tail: Kept[] = [];
    const tailColors: Kept[] = [];
    for (const x of balanced) {
      if (x.isColor && !x.isMedia && !mediaSet.has(x.k)) tailColors.push(x);
      else if (x.isTail) tail.push(x);
      else head.push(x);
    }
    const keptTail: Kept[] = [];
    let genericCount = 0;
    for (const x of tail) {
      if (x.src === 'theme' || genericCount < GENERIC_TAIL_MAX) {
        keptTail.push(x);
        if (x.src !== 'theme') genericCount++;
      } else {
        removed.push(x.k);
        warnings.push(`Kata kunci '${x.k}' dibuang: melebihi ${GENERIC_TAIL_MAX} kata generik.`);
      }
    }
    const moved = tail.filter((x) => balanced.indexOf(x) < top).map((x) => x.k);
    if (moved.length) warnings.push(`Kata generik dipindah ke akhir: ${moved.join(', ')}.`);
    tailPartitioned = [...head, ...keptTail, ...tailColors];
  }
  // Kebijakan 30–49: tak melewati batas maksimum platform.
  const cap = Math.min(KEYWORD_TARGET_MAX, platformMax(input.platform));
  const final = tailPartitioned.slice(0, cap);
  for (const x of tailPartitioned.slice(cap)) removed.push(x.k);

  const srcCounts: Record<KeywordSrc, number> = {
    visible: 0,
    attribute: 0,
    synonym: 0,
    theme: 0,
    usage: 0
  };
  for (const x of final) srcCounts[x.src]++;

  return {
    items: final.map(({ k, src, rel, kind, standalone }) => ({
      k,
      src,
      ...(rel ? { rel } : {}),
      ...(kind ? { kind } : {}),
      ...(standalone ? { standalone: true as const } : {})
    })),
    keywords: final.map((x) => x.k),
    removed,
    warnings,
    srcCounts,
    themeMismatch: !input.themeFit
  };
}

/**
 * Normalisasi ringan untuk daftar flat lawas (data sesi lama / respons tanpa
 * src): trim + lowercase, buang yang berspasi/latar/anatomi/kepala-generik/
 * Indonesia, dedupe. Tanpa verifikasi grounding.
 */
export function normalizeLegacyKeywords(list: string[], platform: Platform): { keywords: string[]; removed: string[] } {
  const out: string[] = [];
  const removed: string[] = [];
  const seen = new Set<string>();
  for (const raw of list ?? []) {
    const k = normalizeSingle(raw);
    if (!k || inSet(BG, k) || inSet(LOW, k) || inSet(ANATOMY, k) || inSet(ORPHAN_HEAD, k)) {
      if (String(raw ?? '').trim()) removed.push(String(raw));
      continue;
    }
    if (seen.has(stemKeyword(k))) {
      removed.push(String(raw));
      continue;
    }
    seen.add(stemKeyword(k));
    out.push(k);
  }
  return { keywords: out.slice(0, platformMax(platform)), removed };
}

/**
 * Normalisasi satu kata: trim + lowercase. Kembalikan '' bila kosong,
 * berspasi (frasa diurus jalur sourced), atau Indonesia.
 */
export function normalizeSingle(raw: string): string {
  const v = norm(raw).toLowerCase();
  if (!v || /\s/.test(v)) return '';
  if (isIndonesianKeyword(v)) return '';
  return v;
}

/** Judul AI: kapital di awal, tanpa koma. */
export function cleanAiTitle(title: string): string {
  const v = norm(title).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (!v) return v;
  return v.charAt(0).toUpperCase() + v.slice(1);
}
