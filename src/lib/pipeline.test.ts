import { describe, expect, it } from 'vitest';
import type { Observation } from './observation';
import { runFramePipeline } from './pipeline';
import type { ParsedMetadata } from './prompt';
import type { ImageInput, ProviderAdapter } from './providers/types';

const OBS: Observation = {
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
  theme_mismatch: false
};

const SS_JSON = JSON.stringify({
  description: 'A red panda eats bamboo shoots in a green mountain forest during bright daylight hours.',
  keywords: ['red panda', 'bamboo', 'forest', 'eating', 'wildlife', 'mammal', 'nature', 'green'],
  categories: ['Animals/Wildlife']
});

const META_JSON = JSON.stringify({
  title: 'Red panda eating bamboo in forest',
  keywords: ['red panda', 'bamboo', 'forest', 'eating', 'wildlife'],
  category: 13
});

interface Script {
  observe?: () => Observation;
  stageB?: () => string;
  ground?: () => string;
}

function mockAdapter(script: Script = {}, vision = true) {
  const calls = { observe: 0, text: [] as string[], judge: 0 };
  let stageBCalls = 0;
  const adapter: ProviderAdapter = {
    id: 'groq',
    label: 'Mock',
    supportsVision: vision,
    testConnection: async () => ({ ok: true }),
    generateForImage: async () => ({} as ParsedMetadata),
    analyzeImage: async () => ({ verdict: 'layak', issues: [], summary: '' }),
    observeImage: async (a) => {
      calls.observe++;
      expect(a.image.base64).toBe('QUFBQQ=='); // gambar nyata di payload
      return script.observe ? script.observe() : OBS;
    },
    callText: async (a) => {
      calls.text.push(a.prompt);
      if (a.prompt.includes('Periksa setiap keyword')) return script.ground ? script.ground() : '{"unsupported": []}';
      stageBCalls++;
      if (script.stageB) return script.stageB();
      return a.prompt.includes('SHUTTERSTOCK') ? SS_JSON : META_JSON;
    },
    callJudge: async () => {
      calls.judge++;
      return {
        verdict: 'pass', score: 100, checks: [], unsupported_metadata: [], ip_risks: [],
        category_ok: true, suggested_category: null, needs_editorial_or_release: false, confidence: 1
      };
    }
  };
  return { adapter, calls, stageBCount: () => stageBCalls };
}

const IMAGE: ImageInput = { base64: 'QUFBQQ==', mimeType: 'image/jpeg' };
const baseArgs = (adapter: ProviderAdapter) => ({
  adapter,
  apiKey: 'k',
  image: IMAGE,
  platform: 'adobe' as const,
  theme: 'Halloween',
  strictVerify: true
});

describe('runFramePipeline', () => {
  it('Tahap A 1x lalu B+D; Tahap B/D tidak pernah membawa gambar', async () => {
    const { adapter, calls } = mockAdapter();
    const out = await runFramePipeline(baseArgs(adapter));
    expect(calls.observe).toBe(1);
    expect(out.observedFresh).toBe(true);
    expect(out.metadata.title).toBe('Red panda eating bamboo in forest');
    // tidak ada prompt teks yang mengandung base64 gambar
    expect(calls.text.every((p) => !p.includes('QUFBQQ=='))).toBe(true);
    expect(calls.text.some((p) => p.includes('OBSERVASI GAMBAR'))).toBe(true);
  });

  it('cache: ganti platform / buat ulang tidak memanggil Tahap A', async () => {
    const { adapter, calls } = mockAdapter();
    const first = await runFramePipeline(baseArgs(adapter));
    const second = await runFramePipeline({
      ...baseArgs(adapter),
      platform: 'shutterstock',
      cachedObservation: first.observation
    });
    expect(calls.observe).toBe(1);
    expect(second.observedFresh).toBe(false);
  });

  it('kategori di luar daftar → retry 1x lalu tandai perlu ditinjau (bukan lolos diam-diam)', async () => {
    const bad = JSON.stringify({ title: 'Red panda', keywords: ['red panda', 'bamboo', 'forest', 'eating', 'wildlife'], category: 'Kopi' });
    const { adapter, stageBCount } = mockAdapter({ stageB: () => bad });
    const out = await runFramePipeline(baseArgs(adapter));
    expect(stageBCount()).toBe(2);
    expect(out.categoryNeedsReview).toBe(true);
    expect(out.metadata.category).toBe('');
  });

  it('grounding menghapus keyword tak didukung dan terlihat di hasil', async () => {
    const six = JSON.stringify({
      title: 'Red panda eating bamboo in forest',
      keywords: ['red panda', 'bamboo', 'forest', 'eating', 'wildlife', 'mammal'],
      category: 13
    });
    const { adapter } = mockAdapter({ stageB: () => six, ground: () => '{"unsupported": ["wildlife"]} ' });
    const out = await runFramePipeline(baseArgs(adapter));
    expect(out.removedUnsupported).toEqual(['wildlife']);
    expect(out.metadata.keywords).not.toContain('wildlife');
    expect(out.metadata.keywords).toHaveLength(5);
  });

  it('keyword di bawah minimum setelah grounding → regenerasi 1x; tetap kurang → error jelas', async () => {
    const poor = JSON.stringify({
      title: 'Red panda', keywords: ['red panda', 'bamboo'], category: 13
    });
    const { adapter, stageBCount } = mockAdapter({
      stageB: () => poor,
      ground: () => '{"unsupported": []}'
    });
    await expect(runFramePipeline(baseArgs(adapter))).rejects.toThrow('keyword tidak cukup');
    expect(stageBCount()).toBe(2); // awal + 1x regenerasi
  });

  it('strictVerify mati → grounding dilewati', async () => {
    const { adapter, calls } = mockAdapter({ ground: () => { throw new Error('jangan dipanggil'); } });
    const out = await runFramePipeline({ ...baseArgs(adapter), strictVerify: false });
    expect(calls.text.every((p) => !p.includes('Periksa setiap keyword'))).toBe(true);
    expect(out.removedUnsupported).toEqual([]);
  });

  it('provider tanpa vision → frame berhenti, observe tidak dipanggil', async () => {
    const { adapter, calls } = mockAdapter({}, false);
    await expect(runFramePipeline(baseArgs(adapter))).rejects.toMatchObject({ noVision: true });
    expect(calls.observe).toBe(0);
  });

  it('tema diteruskan sebagai petunjuk observasi (bukan sumber isi)', async () => {
    const seen: (string | undefined)[] = [];
    const { adapter } = mockAdapter({
      observe: () => {
        seen.push('Halloween');
        return { ...OBS, theme_mismatch: true };
      }
    });
    const out = await runFramePipeline(baseArgs(adapter));
    expect(seen).toEqual(['Halloween']);
    expect(out.observation.theme_mismatch).toBe(true);
    expect(out.compliance.some((w) => w.code === 'THEME_MISMATCH')).toBe(true);
  });
});
