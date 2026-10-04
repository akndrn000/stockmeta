import { describe, expect, it } from 'vitest';
import {
  buildObservationPrompt,
  complianceWarnings,
  defaultCategoryHint,
  parseObservationResponse,
  type Observation
} from './observation';

const base = (patch: Partial<Observation> = {}): Observation => ({
  media_type: 'photo',
  main_subject: 'red panda',
  secondary_subjects: ['bamboo'],
  people: { count: 0, recognizable_face: false, visible_actions: [] },
  setting: 'mountain forest',
  time_or_lighting: 'daylight',
  viewpoint_composition: ['eye level'],
  colors: ['green', 'brown'],
  mood_concepts: ['calm'],
  copy_space: false,
  isolated_background: false,
  visible_text: [],
  visible_brands_logos: [],
  landmarks_or_private_property: [],
  possible_ai_look: false,
  quality_issues: [],
  confidence: 0.9,
  theme_mismatch: false,
  ...patch
});

describe('buildObservationPrompt', () => {
  it('melarang nama file sebagai sumber; tema hanya petunjuk', () => {
    const p = buildObservationPrompt('Halloween');
    expect(p).toContain('SATU-SATUNYA adalah isi gambar');
    expect(p).toContain('Jangan memakai nama file');
    expect(p).toContain('HANYA petunjuk');
    expect(p).toContain('theme_mismatch = true');
    expect(buildObservationPrompt('')).not.toContain('tema');
  });
});

describe('parseObservationResponse', () => {
  it('JSON dalam code fence terurai; array kosong lebih baik daripada tebakan', () => {
    const raw = '```json\n' + JSON.stringify(base()) + '\n```';
    expect(parseObservationResponse(raw)).toEqual(base());
  });

  it('field hilang → error json (di-retry, bukan metadata kosong)', () => {
    const rest = base() as unknown as Record<string, unknown>;
    delete rest.main_subject;
    expect(() => parseObservationResponse(JSON.stringify(rest))).toThrow('main_subject');
  });

  it('media_type tak dikenal / confidence di luar 0-1 → error', () => {
    expect(() => parseObservationResponse(JSON.stringify(base({ media_type: 'hologram' as never })))).toThrow('media_type');
    expect(() => parseObservationResponse(JSON.stringify(base({ confidence: 1.5 })))).toThrow('confidence');
    expect(() => parseObservationResponse('bukan json')).toThrow('JSON tidak valid');
  });
});

describe('complianceWarnings (Tahap C)', () => {
  it('merek terlihat → IP_TEXT berbeda pesan per platform', () => {
    const obs = base({ visible_brands_logos: ['Nike'], visible_text: ['JUST DO IT'] });
    const adobe = complianceWarnings(obs, 'adobe');
    expect(adobe.warnings.some((w) => w.code === 'IP_TEXT' && w.message.includes('hapus atau samarkan'))).toBe(true);
    const ss = complianceWarnings(obs, 'shutterstock');
    expect(ss.warnings.some((w) => w.code === 'IP_TEXT' && w.message.includes('Editorial'))).toBe(true);
    expect(adobe.editorialSuggested).toBe(true);
  });

  it('wajah dikenali → MODEL_RELEASE + editorialSuggested', () => {
    const obs = base({ people: { count: 1, recognizable_face: true, visible_actions: ['smiling'] } });
    const r = complianceWarnings(obs, 'adobe');
    expect(r.warnings.some((w) => w.code === 'MODEL_RELEASE' && w.message.includes('Recognizable people'))).toBe(true);
    expect(r.editorialSuggested).toBe(true);
  });

  it('media illustration → NON_PHOTO + illustrationSuggested; saran toggle SS', () => {
    const obs = base({ media_type: 'illustration' });
    const r = complianceWarnings(obs, 'shutterstock');
    expect(r.illustrationSuggested).toBe(true);
    expect(r.warnings.some((w) => w.code === 'NON_PHOTO' && w.message.includes('Ilustrasi'))).toBe(true);
    expect(complianceWarnings(base(), 'adobe').illustrationSuggested).toBe(false);
  });

  it('confidence 0.4 → LOW_CONFIDENCE; quality_issues → QUALITY; AI look → AI_LOOK', () => {
    const obs = base({ confidence: 0.4, quality_issues: ['noise'], possible_ai_look: true });
    const codes = complianceWarnings(obs, 'adobe').warnings.map((w) => w.code);
    expect(codes).toContain('LOW_CONFIDENCE');
    expect(codes).toContain('QUALITY');
    expect(codes).toContain('AI_LOOK');
  });

  it('landmark → PROPERTY_RELEASE; theme_mismatch → THEME_MISMATCH', () => {
    const obs = base({ landmarks_or_private_property: ['private villa'], theme_mismatch: true });
    const codes = complianceWarnings(obs, 'adobe').warnings.map((w) => w.code);
    expect(codes).toContain('PROPERTY_RELEASE');
    expect(codes).toContain('THEME_MISMATCH');
  });
});

describe('defaultCategoryHint', () => {
  it('ikon/pola/vektor datar → Adobe 8 / SS Backgrounds/Textures', () => {
    expect(defaultCategoryHint(base({ media_type: 'icon' }), 'adobe')).toBe(8);
    expect(defaultCategoryHint(base({ media_type: 'pattern_texture' }), 'adobe')).toBe(8);
    expect(defaultCategoryHint(base({ media_type: 'vector_like' }), 'shutterstock')).toBe('Backgrounds/Textures');
    expect(defaultCategoryHint(base(), 'adobe')).toBeNull();
  });
});
