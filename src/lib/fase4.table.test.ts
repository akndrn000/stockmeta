// M34 table-driven (adapter dan respons palsu, tanpa jaringan):
// 1. Kasus gambar bukti (kotak P3K hewan bertema perayaan) dengan respons
//    SENGAJA kotor memuat semua kata salah dari bukti masalah.
// 2. Minimal 4 domain lain (dapur, lalu lintas, tulis, outdoor) dengan
//    potongan tak bermakna setara.
// Untuk Adobe dan Shutterstock: posisi 1, inti ≤3, sekunder ≤3, tanpa kembar.
import { describe, expect, it } from 'vitest';
import { BACKGROUND_STOPLIST, KEYWORD_PHRASE_MAX } from './limits';
import { applyStageRemovals, finalizeModelOutput } from './finalize';
import { processSourcedKeywords } from './keywordGroups';
import { looksIndonesian } from './language';
import {
  parseMetadataResponse,
  type ImageObservation,
  type SourcedKeyword
} from './prompt';
import type { Platform } from './types';
import { validateMetadata } from './validate';

const BG_SET = new Set(BACKGROUND_STOPLIST.map((w) => w.toLowerCase()));
const PLATFORMS: Platform[] = ['adobe', 'shutterstock'];

// Pengamatan palsu gambar bukti: kotak medis, jarum, termometer, perban,
// sayap kelelawar, bulan sabit; media foto.
const KIT_OBS: ImageObservation = {
  objects: ['first aid kit', 'medical cross'],
  parts: [
    'syringe', 'thermometer', 'bandage', 'bat wings', 'crescent moon',
    'bag handle', 'medical box', 'medicine'
  ],
  styles: ['cartoon'],
  moods: ['cheerful'],
  usages: ['calendar', 'banner', 'giftwrap', 'keepsake'],
  colors: ['red', 'white'],
  media_type: 'photo'
};

// Respons model palsu SENGAJA kotor: potongan (kit/print/handle/cross),
// anatomi (ears/eyes), sinonim lintas jenis (puppy), makhluk sebagai tema.
function kitDirty(): SourcedKeyword[] {
  return [
    { k: 'first aid kit', src: 'visible' },
    { k: 'syringe', src: 'visible' },
    { k: 'thermometer', src: 'visible' },
    { k: 'bandage', src: 'visible' },
    { k: 'cross', src: 'visible' },
    { k: 'kit', src: 'visible' },
    { k: 'print', src: 'visible' },
    { k: 'handle', src: 'visible' },
    { k: 'ears', src: 'visible' },
    { k: 'eyes', src: 'visible' },
    { k: 'bat wings', src: 'visible' },
    { k: 'crescent moon', src: 'visible' },
    { k: 'medical box', src: 'visible' },
    { k: 'medicine', src: 'visible' },
    { k: 'container', src: 'synonym', of: 'medical box', rel: 'parent' },
    { k: 'puppy', src: 'synonym', of: 'medical box', rel: 'synonym' },
    { k: 'needle', src: 'synonym', of: 'syringe', rel: 'specific' },
    { k: 'cartoon', src: 'attribute' },
    { k: 'cheerful', src: 'attribute' },
    { k: 'red', src: 'attribute' },
    { k: 'white', src: 'attribute' },
    { k: 'photo', src: 'attribute' },
    { k: 'halloween', src: 'theme', kind: 'event' },
    { k: 'celebration', src: 'theme', kind: 'event' },
    { k: 'party', src: 'theme', kind: 'activity' },
    { k: 'october', src: 'theme', kind: 'season' },
    { k: 'holiday', src: 'theme', kind: 'event' },
    { k: 'spooky', src: 'theme', kind: 'mood' },
    { k: 'carnival', src: 'theme', kind: 'event' },
    { k: 'ghost', src: 'theme', kind: 'event' },
    { k: 'vampire', src: 'theme', kind: 'event' },
    { k: 'freak', src: 'theme', kind: 'event' },
    { k: 'monster', src: 'theme', kind: 'event' },
    { k: 'fairy', src: 'theme', kind: 'event' },
    { k: 'frightener', src: 'theme', kind: 'event' },
    { k: 'calendar', src: 'usage' },
    { k: 'banner', src: 'usage' },
    { k: 'giftwrap', src: 'usage' },
    { k: 'keepsake', src: 'usage' }
  ];
}

// Tahap D palsu: sinonim salah jenis + tema makhluk + kembar semantik.
const KIT_D_REMOVE = ['puppy', 'ghost', 'vampire', 'freak', 'monster', 'fairy', 'frightener', 'medicine'];

function kitRaw(platform: Platform): string {
  return JSON.stringify({
    title: 'Halloween first aid kit with bat wings',
    description: 'A Halloween first aid kit with bat wings in soft light.',
    keywords: kitDirty(),
    category: platform === 'adobe' ? 'Animals' : ['Animals/Wildlife', 'Holidays'],
    categories: ['Animals/Wildlife', 'Holidays'],
    theme_canonical: 'Halloween',
    theme_fit: true,
    theme_evidence: 'bat wings and pumpkin lantern in frame',
    observation: KIT_OBS
  });
}

describe.each(PLATFORMS)('M34 kasus bukti kotak P3K (platform %s)', (platform) => {
  it('deterministik: "first aid kit" utuh; tanpa kit/print/handle/cross/ears', () => {
    const fin = finalizeModelOutput(parseMetadataResponse(kitRaw(platform), platform), platform);
    const kws = fin.meta.keywords ?? [];
    expect(kws).toContain('first aid kit');
    for (const bad of ['kit', 'print', 'handle', 'cross', 'ears', 'eyes']) {
      expect(kws).not.toContain(bad);
    }
    // kolam kaya: 30 atau lebih sebelum Tahap D
    expect(kws.length).toBeGreaterThanOrEqual(30);
  });

  it('setelah Tahap D: posisi 1, inti ≤3, sekunder ≤3, tanpa kembar berlebih', () => {
    const fin = finalizeModelOutput(parseMetadataResponse(kitRaw(platform), platform), platform);
    const applied = applyStageRemovals(fin.items, KIT_D_REMOVE);
    const kws = applied.items.map((x) => x.k);
    for (const bad of ['puppy', 'freak', 'frightener', 'fairy', 'vampire', 'ghost', 'monster', 'medicine']) {
      expect(kws).not.toContain(bad);
    }
    // (1) frasa subjek di posisi 1; (2) inti tema di posisi ≤3
    expect(kws[0]).toBe('first aid kit');
    expect(kws.slice(0, 3)).toContain('halloween');
    // (3) benda sekunder tunggal di 10 teratas ≤3; kostum + media di 10 pertama
    const first10 = kws.slice(0, 10);
    expect(first10).toContain('bat wings');
    expect(first10).toContain('photo');
    expect(first10.filter((k) => ['syringe', 'thermometer', 'bandage'].includes(k)).length).toBeLessThanOrEqual(3);
    // (4) frasa dua kata ≤ KEYWORD_PHRASE_MAX; tiga kata hanya subjek
    const phrases = kws.filter((k) => k.includes(' '));
    expect(phrases.length).toBeLessThanOrEqual(KEYWORD_PHRASE_MAX);
    expect(phrases).toContain('first aid kit');
    expect(kws.filter((k) => k.split(' ').length === 3)).toEqual(['first aid kit']);
    // warna identitas paling akhir (maks 2)
    expect(kws.slice(-2)).toEqual(['red', 'white']);
    if (platform === 'adobe') {
      const t = fin.meta.title ?? '';
      expect(t.charAt(0)).toBe(t.charAt(0).toUpperCase());
    } else {
      const d = fin.meta.description ?? '';
      expect(looksIndonesian(d)).toBe(false);
      expect(fin.meta.categories).toHaveLength(2);
    }
  });
});

// 4 domain lain dengan istilah majemuk + potongan tak bermakna setara.
interface CrossCase {
  name: string;
  obs: ImageObservation;
  sourced: SourcedKeyword[];
  whole: string;
  orphan: string;
  good: string[];
}

const CROSS: CrossCase[] = [
  {
    name: 'alat dapur',
    obs: {
      objects: ['cutting board'],
      parts: ['knife', 'grip'],
      materials: ['wood'],
      colors: [],
      media_type: 'photo'
    },
    sourced: [
      { k: 'cutting board', src: 'visible' },
      { k: 'knife', src: 'visible' },
      { k: 'board', src: 'visible' },
      { k: 'grip', src: 'visible' },
      { k: 'lemon', src: 'synonym', of: 'knife', rel: 'synonym' },
      { k: 'goblin', src: 'theme', kind: 'event' },
      { k: 'cooking', src: 'theme', kind: 'activity' }
    ],
    whole: 'cutting board',
    orphan: 'board',
    good: ['cutting board', 'knife', 'grip', 'cooking']
  },
  {
    name: 'benda lalu lintas',
    obs: {
      objects: ['traffic light'],
      parts: ['pole', 'signal'],
      colors: ['red'],
      media_type: 'photo'
    },
    sourced: [
      { k: 'traffic light', src: 'visible' },
      { k: 'pole', src: 'visible' },
      { k: 'signal', src: 'visible' },
      { k: 'light', src: 'visible' },
      { k: 'truck', src: 'synonym', of: 'pole', rel: 'synonym' },
      { k: 'spirit', src: 'theme', kind: 'season' },
      { k: 'commute', src: 'theme', kind: 'activity' }
    ],
    whole: 'traffic light',
    orphan: 'light',
    good: ['traffic light', 'pole', 'signal', 'commute']
  },
  {
    name: 'benda tulis',
    obs: {
      objects: ['pencil case'],
      parts: ['pencils', 'zipper'],
      materials: ['fabric'],
      colors: [],
      media_type: 'photo'
    },
    sourced: [
      { k: 'pencil case', src: 'visible' },
      { k: 'pencils', src: 'visible' },
      { k: 'zipper', src: 'visible' },
      { k: 'case', src: 'visible' },
      { k: 'crayon', src: 'synonym', of: 'pencils', rel: 'synonym' },
      { k: 'elf', src: 'theme', kind: 'event' },
      { k: 'study', src: 'theme', kind: 'activity' }
    ],
    whole: 'pencil case',
    orphan: 'case',
    good: ['pencil case', 'pencils', 'zipper', 'study']
  },
  {
    name: 'aktivitas outdoor',
    obs: {
      objects: ['sleeping bag'],
      parts: ['tent', 'trail'],
      moods: ['calm'],
      colors: ['green'],
      media_type: 'photo'
    },
    sourced: [
      { k: 'sleeping bag', src: 'visible' },
      { k: 'tent', src: 'visible' },
      { k: 'trail', src: 'visible' },
      { k: 'bag', src: 'visible' },
      { k: 'puppy', src: 'synonym', of: 'tent', rel: 'synonym' },
      { k: 'wraith', src: 'theme', kind: 'event' },
      { k: 'camping', src: 'theme', kind: 'activity' }
    ],
    whole: 'sleeping bag',
    orphan: 'bag',
    good: ['sleeping bag', 'tent', 'trail', 'camping']
  }
];

describe.each(CROSS)('M34 lintas domain: $name', (c) => {
  it.each(PLATFORMS)('platform %s: utuh di posisi 1, potongan dibuang, D membersihkan', (platform) => {
    const raw = JSON.stringify({
      title: 'Sample title for test purposes only',
      description: 'A sample description for test purposes in soft light.',
      keywords: c.sourced,
      category: platform === 'adobe' ? 'Animals' : ['Nature', 'Animals/Wildlife'],
      categories: ['Nature', 'Animals/Wildlife'],
      theme_canonical: 'Test Theme',
      theme_fit: true,
      theme_evidence: 'visible elements in frame',
      observation: c.obs
    });
    const fin = finalizeModelOutput(parseMetadataResponse(raw, platform), platform);
    const kws = fin.meta.keywords ?? [];
    // istilah utuh di posisi 1; potongan tak bermakna dibuang deterministik
    expect(kws[0]).toBe(c.whole);
    expect(kws).not.toContain(c.orphan);
    // sinonim lintas jenis + tema makhluk menunggu Tahap D
    const badSyn = c.sourced.find((s) => s.src === 'synonym' && !c.good.includes(s.k))!.k;
    const badTheme = c.sourced.find((s) => s.src === 'theme' && !c.good.includes(s.k))!.k;
    expect(kws).toContain(badSyn);
    expect(kws).toContain(badTheme);
    const applied = applyStageRemovals(fin.items, [badSyn, badTheme]);
    const clean = applied.items.map((x) => x.k);
    expect(clean).not.toContain(badSyn);
    expect(clean).not.toContain(badTheme);
    for (const g of c.good) expect(clean).toContain(g);
    // selain frasa subjek, tanpa spasi lain; tanpa kata latar
    expect(clean.filter((k) => /\s/.test(k))).toEqual([c.whole]);
    expect(clean.some((k) => BG_SET.has(k))).toBe(false);
  });
});

describe('M34 frasa tiga kata: hanya nama observasi; cap 3', () => {
  const OBS3: ImageObservation = {
    objects: ['first aid kit', 'medical cross'],
    parts: ['syringe'],
    colors: []
  };
  function run3(list: SourcedKeyword[]) {
    return processSourcedKeywords({
      sourced: list,
      obs: OBS3,
      canonical: '',
      themeFit: false,
      themeEvidence: '',
      mediaType: 'photo',
      platform: 'adobe',
      titleText: ''
    });
  }
  it('bukan nama obs → ditolak; cap maksimal 3', () => {
    const mk = (k: string): SourcedKeyword => ({ k, src: 'visible' });
    const r = run3([
      mk('first aid kit'), mk('red big box'), mk('hot air balloon'), mk('big red box'), mk('red box kit')
    ]);
    expect(r.keywords).toContain('first aid kit');
    expect(r.keywords).not.toContain('red big box');
    expect(r.keywords).not.toContain('hot air balloon');
    expect(r.keywords).not.toContain('big red box');
    expect(r.keywords).not.toContain('red box kit');
  });

  it('KEYWORD_PHRASE_WORDS_MAX = 2 mengembalikan perilaku dua kata', () => {
    const mk = (k: string): SourcedKeyword => ({ k, src: 'visible' });
    const base = {
      sourced: [mk('first aid kit'), mk('black cat')],
      obs: { objects: ['first aid kit'], parts: ['black', 'cat'], colors: [] },
      canonical: '',
      themeFit: false,
      themeEvidence: '',
      mediaType: 'photo',
      platform: 'adobe' as const,
      titleText: ''
    };
    const two = processSourcedKeywords(base, { wordsMax: 2 });
    expect(two.keywords).not.toContain('first aid kit');
    expect(two.keywords).toContain('black cat');
  });

  it('KEYWORD_PHRASE_MAX = 0 mengembalikan satu kata penuh', () => {
    const mk = (k: string): SourcedKeyword => ({ k, src: 'visible' });
    const r = processSourcedKeywords(
      {
        sourced: [mk('cat'), mk('black cat')],
        obs: { objects: ['cat'], parts: ['black'], colors: [] },
        canonical: '',
        themeFit: false,
        themeEvidence: '',
        mediaType: 'photo',
        platform: 'adobe',
        titleText: ''
      },
      { phraseMax: 0 }
    );
    expect(r.keywords).toEqual(['cat']);
  });
});

describe('M34 kolam kaya/miskin dan anggaran panggilan', () => {
  it('kolam kaya: 30 atau lebih tanpa kata di luar pengamatan/tema', () => {
    const fin = finalizeModelOutput(
      parseMetadataResponse(
        JSON.stringify({
          title: 'Halloween first aid kit with bat wings',
          description: 'A Halloween first aid kit with bat wings.',
          keywords: kitDirty(),
          category: 'Animals',
          theme_canonical: 'Halloween',
          theme_fit: true,
          theme_evidence: 'bat wings in frame',
          observation: KIT_OBS
        }),
        'adobe'
      ),
      'adobe'
    );
    const kws = fin.meta.keywords ?? [];
    expect(kws.length).toBeGreaterThanOrEqual(30);
  });

  it('kolam miskin: saran tanpa kata karangan (difinalisasi, tanpa panggilan)', () => {
    const fin = finalizeModelOutput(
      parseMetadataResponse(
        JSON.stringify({
          title: 'A fox rests',
          description: 'A fox rests in soft light.',
          keywords: [
            { k: 'fox', src: 'visible' },
            { k: 'kit', src: 'visible' }
          ],
          category: 'Animals',
          theme_canonical: 'Snow',
          theme_fit: false,
          theme_evidence: '',
          observation: { objects: ['fox'], colors: [], media_type: 'photo' }
        }),
        'adobe'
      ),
      'adobe'
    );
    // 'kit' potongan tanpa frasa induk → dibuang; tersisa yang sah saja
    expect(fin.meta.keywords).toEqual(['fox']);
    const notes = validateMetadata('adobe', {
      title: 'A fox rests',
      keywords: fin.meta.keywords ?? [],
      category: 'Animals'
    });
    const thin = notes.find((n) => n.message.startsWith('Kata kunci kurang dari'));
    expect(thin).toBeDefined();
    expect(thin!.blocking).toBeFalsy();
  });
});
