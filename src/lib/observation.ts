// Tahap A — Pengamatan vision (1x per frame, di-cache di sesi) + Tahap C —
// pemeriksaan kepatuhan deterministik dari observation. Tanpa panggilan jaringan.
import { LOW_CONFIDENCE_THRESHOLD } from './platform-rules';
import type { Platform } from './types';

export type ObservationMediaType =
  | 'photo'
  | 'illustration'
  | 'vector_like'
  | '3d_render'
  | 'icon'
  | 'pattern_texture'
  | 'unknown';

export const OBSERVATION_MEDIA_TYPES: readonly ObservationMediaType[] = [
  'photo', 'illustration', 'vector_like', '3d_render', 'icon', 'pattern_texture', 'unknown'
];

export interface ObservationPeople {
  count: number;
  recognizable_face: boolean;
  visible_actions: string[];
}

export interface Observation {
  media_type: ObservationMediaType;
  main_subject: string;
  secondary_subjects: string[];
  people: ObservationPeople;
  setting: string;
  time_or_lighting: string;
  viewpoint_composition: string[];
  colors: string[];
  mood_concepts: string[];
  copy_space: boolean;
  isolated_background: boolean;
  visible_text: string[];
  visible_brands_logos: string[];
  landmarks_or_private_property: string[];
  possible_ai_look: boolean;
  quality_issues: string[];
  confidence: number;
  /** true bila isi gambar bertentangan dengan tema batch (tema diabaikan frame ini) */
  theme_mismatch: boolean;
}

/**
 * Prompt Tahap A: HANYA isi gambar yang jadi sumber. Nama file TIDAK PERNAH jadi
 * sumber isi (hanya kolom Filename). Tema batch hanya petunjuk — bila bertentangan,
 * abaikan dan tandai theme_mismatch. Ragu = array kosong + confidence rendah.
 */
export function buildObservationPrompt(theme?: string): string {
  const lines = [
    'Amati gambar ini dan kembalikan JSON pengamatan. ATURAN KERAS:',
    '- Sumber SATU-SATUNYA adalah isi gambar yang terlihat. Jangan memakai nama file, metadata file, atau tebakan luar gambar.',
    '- JANGAN menebak nama orang, merek, lokasi, usia, etnis, gender, kondisi kesehatan, atau peristiwa berita. Tulis hanya yang terlihat jelas; ragu = array kosong dan turunkan confidence.',
    '- Array kosong lebih baik daripada tebakan.'
  ];
  const t = (theme ?? '').trim();
  if (t) {
    lines.push(
      'Petunjuk tema dari kontributor: "' + t + '".',
      'Tema HANYA petunjuk. Jika isi gambar bertentangan dengan tema, ABAIKAN tema untuk gambar ini dan set theme_mismatch = true.'
    );
  }
  lines.push(
    '',
    'Format JSON (wajib semua field, array boleh kosong):',
    '{"media_type": "photo"|"illustration"|"vector_like"|"3d_render"|"icon"|"pattern_texture"|"unknown",',
    ' "main_subject": string subjek utama yang terlihat jelas,',
    ' "secondary_subjects": string[], "people": {"count": number, "recognizable_face": boolean, "visible_actions": string[]},',
    ' "setting": string, "time_or_lighting": string, "viewpoint_composition": string[],',
    ' "colors": string[], "mood_concepts": string[], "copy_space": boolean, "isolated_background": boolean,',
    ' "visible_text": string[] (tulisan yang benar-benar terbaca), "visible_brands_logos": string[] (merek/logo yang benar-benar terlihat),',
    ' "landmarks_or_private_property": string[], "possible_ai_look": boolean, "quality_issues": string[],',
    ' "confidence": number 0-1, "theme_mismatch": boolean}',
    '',
    'Keluarkan HANYA JSON valid, tanpa teks tambahan, tanpa markdown code block.'
  );
  return lines.join('\n');
}

function jsonError(message: string): Error {
  return Object.assign(new Error(message), { kind: 'json' });
}

function pick(o: Record<string, unknown>, k: string): unknown {
  const hit = Object.keys(o).find((x) => x.toLowerCase() === k);
  return hit ? o[hit] : undefined;
}

function strArray(v: unknown, field: string): string[] {
  if (!Array.isArray(v)) throw jsonError('Observation tidak valid: ' + field + ' bukan array');
  return v.map((x) => String(x ?? '').trim()).filter(Boolean);
}

function reqStr(o: Record<string, unknown>, field: string, allowEmpty: boolean): string {
  const v = pick(o, field);
  if (typeof v !== 'string' || (!allowEmpty && !v.trim())) {
    throw jsonError('Observation tidak valid: ' + field + ' hilang/kosong');
  }
  return v.trim();
}

function reqBool(o: Record<string, unknown>, field: string): boolean {
  const v = pick(o, field);
  if (typeof v !== 'boolean') throw jsonError('Observation tidak valid: ' + field + ' bukan boolean');
  return v;
}

/** Parser skema ketat Tahap A — field hilang/tipe salah → error kind 'json' (di-retry). */
export function parseObservationResponse(raw: string): Observation {
  const s = String(raw).trim()
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a === -1 || b <= a) throw jsonError('JSON tidak valid');
  let json: unknown;
  try { json = JSON.parse(s.slice(a, b + 1)); }
  catch { throw jsonError('JSON tidak valid'); }
  if (typeof json !== 'object' || json === null) throw jsonError('JSON tidak valid');
  const o = json as Record<string, unknown>;

  const mediaType = pick(o, 'media_type');
  if (typeof mediaType !== 'string' || !(OBSERVATION_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    throw jsonError('Observation tidak valid: media_type tidak dikenal');
  }
  const peopleRaw = pick(o, 'people');
  if (typeof peopleRaw !== 'object' || peopleRaw === null) throw jsonError('Observation tidak valid: people hilang');
  const people = peopleRaw as Record<string, unknown>;
  const count = pick(people, 'count');
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
    throw jsonError('Observation tidak valid: people.count bukan angka');
  }
  const confidence = pick(o, 'confidence');
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw jsonError('Observation tidak valid: confidence di luar 0-1');
  }

  return {
    media_type: mediaType as ObservationMediaType,
    main_subject: reqStr(o, 'main_subject', false),
    secondary_subjects: strArray(pick(o, 'secondary_subjects'), 'secondary_subjects'),
    people: {
      count: Math.floor(count),
      recognizable_face: reqBool(people, 'recognizable_face'),
      visible_actions: strArray(pick(people, 'visible_actions'), 'people.visible_actions')
    },
    setting: reqStr(o, 'setting', true),
    time_or_lighting: reqStr(o, 'time_or_lighting', true),
    viewpoint_composition: strArray(pick(o, 'viewpoint_composition'), 'viewpoint_composition'),
    colors: strArray(pick(o, 'colors'), 'colors'),
    mood_concepts: strArray(pick(o, 'mood_concepts'), 'mood_concepts'),
    copy_space: reqBool(o, 'copy_space'),
    isolated_background: reqBool(o, 'isolated_background'),
    visible_text: strArray(pick(o, 'visible_text'), 'visible_text'),
    visible_brands_logos: strArray(pick(o, 'visible_brands_logos'), 'visible_brands_logos'),
    landmarks_or_private_property: strArray(pick(o, 'landmarks_or_private_property'), 'landmarks_or_private_property'),
    possible_ai_look: reqBool(o, 'possible_ai_look'),
    quality_issues: strArray(pick(o, 'quality_issues'), 'quality_issues'),
    confidence,
    theme_mismatch: pick(o, 'theme_mismatch') === true
  };
}

/* ---------------- Tahap C: compliance deterministik (peringatan) ---------------- */

export interface ComplianceWarning {
  code: 'IP_TEXT' | 'PROPERTY_RELEASE' | 'MODEL_RELEASE' | 'NON_PHOTO' | 'AI_LOOK' | 'QUALITY' | 'LOW_CONFIDENCE' | 'THEME_MISMATCH';
  message: string;
}

/**
 * Peringatan non-pemblokir dari observation (+ saran flag, bukan keputusan).
 * illustrationSuggested → sarankan toggle Ilustrasi (SS) / ingatkan tipe aset (Adobe).
 * editorialSuggested → merek/logo terlihat atau properti/orang tanpa kemungkinan release.
 */
export function complianceWarnings(
  obs: Observation,
  platform: Platform
): { warnings: ComplianceWarning[]; illustrationSuggested: boolean; editorialSuggested: boolean } {
  const warnings: ComplianceWarning[] = [];
  const illustrationSuggested = obs.media_type !== 'photo' && obs.media_type !== 'unknown';

  if (obs.visible_brands_logos.length > 0 || obs.visible_text.length > 0) {
    warnings.push({
      code: 'IP_TEXT',
      message: platform === 'adobe'
        ? `IP pihak ketiga terlihat (${[...obs.visible_brands_logos, ...obs.visible_text].slice(0, 3).join(', ')}) — hapus atau samarkan sebelum submit Adobe.`
        : `Merek/teks terlihat (${[...obs.visible_brands_logos, ...obs.visible_text].slice(0, 3).join(', ')}) — konten komersial Shutterstock tidak boleh memuat merek; pertimbangkan Editorial atau samarkan.`
    });
  }
  if (obs.landmarks_or_private_property.length > 0) {
    warnings.push({
      code: 'PROPERTY_RELEASE',
      // TODO [VERIFIKASI]: aturan property-release Shutterstock untuk landmark belum
      // dibaca dari sumber resmi — peringatan umum, bukan aturan keras.
      message: `Properti privat/landmark terdeteksi (${obs.landmarks_or_private_property.slice(0, 3).join(', ')}) — siapkan property release (wajib di Adobe).`
    });
  }
  if (obs.people.recognizable_face) {
    warnings.push({
      code: 'MODEL_RELEASE',
      message: platform === 'adobe'
        ? 'Wajah dikenali — siapkan model release; jawab "Recognizable people or property" di portal Adobe.'
        : 'Wajah dikenali — siapkan model release untuk Shutterstock.'
    });
  }
  if (illustrationSuggested) {
    warnings.push({
      code: 'NON_PHOTO',
      message: platform === 'shutterstock'
        ? `Media terdeteksi "${obs.media_type}" — aktifkan toggle Ilustrasi bila sesuai.`
        : `Media terdeteksi "${obs.media_type}" — pastikan tipe aset (Photos/Illustrations/Vectors) benar di portal Adobe.`
    });
  }
  if (obs.possible_ai_look) {
    warnings.push({
      code: 'AI_LOOK',
      message: 'Ada indikasi tampilan-AI — Anda yang memutuskan apakah ini konten AI; bila ya, centang "Created using generative AI tools" di Adobe. Jangan tulis status AI di judul/keyword.'
    });
  }
  if (obs.quality_issues.length > 0) {
    warnings.push({
      code: 'QUALITY',
      message: `Masalah kualitas: ${obs.quality_issues.slice(0, 3).join('; ')}.`
    });
  }
  if (obs.confidence < LOW_CONFIDENCE_THRESHOLD) {
    warnings.push({
      code: 'LOW_CONFIDENCE',
      message: `Confidence pengamatan rendah (${obs.confidence.toFixed(2)}) — frame ini perlu ditinjau manual.`
    });
  }
  if (obs.theme_mismatch) {
    warnings.push({
      code: 'THEME_MISMATCH',
      message: 'Isi gambar bertentangan dengan tema batch — tema diabaikan untuk frame ini ("tema tidak cocok").'
    });
  }

  const editorialSuggested = obs.visible_brands_logos.length > 0
    || obs.landmarks_or_private_property.length > 0
    || obs.people.recognizable_face;
  return { warnings, illustrationSuggested, editorialSuggested };
}

/**
 * Hint kategori dari subjek utama (aturan eksplisit spek saja; null = serahkan ke model).
 * Ikon/pola/tekstur/vektor datar umumnya Graphic Resources (Adobe 8).
 */
export function defaultCategoryHint(obs: Observation, platform: Platform): string | number | null {
  const flat: ObservationMediaType[] = ['icon', 'pattern_texture', 'vector_like'];
  if (platform === 'adobe') {
    if (flat.includes(obs.media_type)) return 8;
    return null;
  }
  if (obs.media_type === 'icon' || obs.media_type === 'pattern_texture' || obs.media_type === 'vector_like') {
    return 'Backgrounds/Textures';
  }
  return null;
}
