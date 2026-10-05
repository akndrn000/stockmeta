// M33 — pasca-proses keyword berbasis sumber: anatomi, rel/kind, frasa, urutan.
// M34 — ditambah: frasa utuh 3 kata, potongan orphan, kembar, urutan inti-tema.
import { describe, expect, it } from 'vitest';
import {
  KEYWORD_COLOR_MAX,
  KEYWORD_MEDIA_MAX,
  KEYWORD_PHRASE3_MAX,
  KEYWORD_USAGE_MAX,
  THEME_CONCEPT_MAX
} from './limits';
import {
  cleanAiTitle,
  normalizeLegacyKeywords,
  normalizeSingle,
  observationGroundingText,
  processSourcedKeywords
} from './keywordGroups';
import type { SourcedKeyword } from './prompt';

const OBS = {
  objects: ['cat'],
  parts: ['wings', 'collar', 'stars', 'moon'],
  patterns: ['stripes'],
  materials: ['wood'],
  shapes: ['crescent'],
  styles: ['cartoon', 'flat'],
  moods: ['cute', 'spooky'],
  usages: ['sticker', 'greeting'],
  colors: ['orange', 'black'],
  media_type: 'vector illustration'
};

const src = (k: string, s: SourcedKeyword['src'], extra?: Partial<SourcedKeyword>): SourcedKeyword =>
  ({ k, src: s, ...extra });

function run(
  sourced: SourcedKeyword[],
  over?: Partial<Parameters<typeof processSourcedKeywords>[0]>,
  opts?: { phraseMax?: number; wordsMax?: number; phrase3Max?: number }
) {
  return processSourcedKeywords(
    {
      sourced,
      obs: OBS,
      canonical: 'Halloween',
      themeFit: true,
      themeEvidence: 'costume ears in frame',
      mediaType: 'vector illustration',
      platform: 'adobe',
      ...over
    },
    opts
  );
}

describe('normalizeSingle', () => {
  it('trim + lowercase; frasa/Indonesia dibuang', () => {
    expect(normalizeSingle('  Fox  ')).toBe('fox');
    expect(normalizeSingle('crescent moon')).toBe('');
    expect(normalizeSingle('dengan')).toBe('');
  });
});

describe('M33 Fase 1 — anatomi generik dibuang kecuali subjek utama', () => {
  it('ears/eyes/mouth/limbs dan kawan-kawan dibuang', () => {
    const r = run([
      src('cat', 'visible'),
      src('ears', 'visible'), src('eyes', 'visible'), src('mouth', 'visible'),
      src('limbs', 'visible'), src('paws', 'visible'), src('tail', 'visible'),
      src('wings', 'visible')
    ]);
    expect(r.keywords).toContain('cat');
    expect(r.keywords).toContain('wings');
    for (const bad of ['ears', 'eyes', 'mouth', 'limbs', 'paws', 'tail']) {
      expect(r.keywords).not.toContain(bad);
    }
  });

  it('anatomi yang tercatat di objects dipertahankan (close-up)', () => {
    const r = run([src('eye', 'visible')], { obs: { objects: ['eye'], colors: [] } });
    expect(r.keywords).toContain('eye');
  });
});

describe('M33 Fase 2a — synonym butuh of + rel valid, sejenis dilarang via D', () => {
  it('tanpa of / tanpa rel / rel asing → dibuang deterministik', () => {
    const r = run([
      src('cat', 'visible'),
      src('kitten', 'synonym', { of: 'cat', rel: 'synonym' }),
      src('feline', 'synonym', { of: 'cat', rel: 'parent' }),
      src('lone', 'synonym'),
      src('beast', 'synonym', { of: 'dragon', rel: 'synonym' }),
      src('mouser', 'synonym', { of: 'cat', rel: 'cousin' as never })
    ]);
    expect(r.keywords).toContain('kitten');
    expect(r.keywords).toContain('feline');
    expect(r.keywords).not.toContain('lone');
    expect(r.keywords).not.toContain('beast');
    expect(r.keywords).not.toContain('mouser');
  });
});

describe('M33 Fase 2b — theme butuh kind valid + fit + evidence', () => {
  it('tanpa kind / kind asing / fit false → dibuang', () => {
    const r = run([
      src('cat', 'visible'),
      src('halloween', 'theme', { kind: 'event' }),
      src('party', 'theme'),
      src('spooky', 'theme', { kind: 'party' as never })
    ]);
    expect(r.keywords).toContain('halloween');
    expect(r.keywords).not.toContain('party');
    expect(r.keywords).not.toContain('spooky');
    const nofit = run([src('cat', 'visible'), src('halloween', 'theme', { kind: 'event' })], {
      themeFit: false,
      themeEvidence: ''
    });
    expect(nofit.keywords).not.toContain('halloween');
    expect(nofit.themeMismatch).toBe(true);
  });

  it(`theme maksimal ${THEME_CONCEPT_MAX}`, () => {
    const themes = Array.from({ length: THEME_CONCEPT_MAX + 3 }, (_, i) => src(`fest${i}`, 'theme', { kind: 'event' }));
    const r = run([src('cat', 'visible'), ...themes]);
    expect(r.srcCounts.theme).toBe(THEME_CONCEPT_MAX);
  });
});

describe('M33 Fase 4 — frasa terkendali', () => {
  it('frasa dua kata baku lolos bila komponen ter-grounding; tiga kata dibuang', () => {
    const r = run([
      src('cat', 'visible'),
      src('black cat', 'visible'),
      src('crescent moon', 'visible'),
      src('hot air balloon', 'visible'),
      src('red background', 'visible')
    ]);
    expect(r.keywords).toContain('black cat');
    expect(r.keywords).toContain('crescent moon');
    expect(r.keywords).not.toContain('hot air balloon');
    expect(r.keywords).not.toContain('red background');
  });

  it('phraseMax 0 = satu kata penuh; 8 = default', () => {
    const list = [src('cat', 'visible'), src('black cat', 'visible')];
    expect(run(list, {}, { phraseMax: 0 }).keywords).toEqual(['cat']);
    expect(run(list, {}, { phraseMax: 8 }).keywords).toContain('black cat');
  });
});

describe('M33 Fase 3 — urutan komersial', () => {
  it('subjek, inti tema, elemen, media, mood, sinonim, tema, usage, warna', () => {
    const r = run([
      src('orange', 'attribute'),
      src('sticker', 'usage'),
      src('party', 'theme', { kind: 'activity' }),
      src('kitten', 'synonym', { of: 'cat', rel: 'synonym' }),
      src('cute', 'attribute'),
      src('vector', 'attribute'),
      src('wings', 'visible'),
      src('halloween', 'theme', { kind: 'event' }),
      src('cat', 'visible')
    ]);
    expect(r.keywords).toEqual([
      'cat', 'halloween', 'wings', 'vector', 'cute', 'kitten', 'party', 'sticker', 'orange'
    ]);
  });

  it('kata inti tema di 5 pertama', () => {
    const r = run([
      src('cat', 'visible'), src('wings', 'visible'), src('collar', 'visible'),
      src('stars', 'visible'), src('moon', 'visible'),
      src('halloween', 'theme', { kind: 'event' })
    ]);
    expect(r.keywords.slice(0, 5)).toContain('halloween');
  });
});

describe('M33 batas media/usage/warna', () => {
  it(`usage non-media-lolos maksimal ${KEYWORD_USAGE_MAX}; media-only usage butuh ilustrasi/vektor`, () => {
    const r = run(
      [
        src('cat', 'visible'), src('sticker', 'usage'), src('greeting', 'usage'),
        src('banner', 'usage'), src('mug', 'usage'), src('cards', 'usage')
      ],
      { obs: { ...OBS, usages: ['sticker', 'greeting', 'banner', 'mug', 'cards'] } }
    );
    expect(r.srcCounts.usage).toBe(KEYWORD_USAGE_MAX);
    const photo = run([src('cat', 'visible'), src('sticker', 'usage')], {
      obs: { objects: ['cat'], usages: ['sticker'], colors: [] },
      mediaType: 'photo'
    });
    expect(photo.keywords).not.toContain('sticker');
  });

  it(`media maksimal ${KEYWORD_MEDIA_MAX}; warna maksimal ${KEYWORD_COLOR_MAX} di akhir`, () => {
    const r = run(
      [
        src('cat', 'visible'), src('vector', 'attribute'), src('illustration', 'attribute'),
        src('image', 'attribute'), src('render', 'attribute'),
        src('orange', 'attribute'), src('black', 'attribute')
      ],
      { obs: { ...OBS, media_type: 'vector illustration image render' }, mediaType: 'vector illustration image render' }
    );
    expect(r.keywords.filter((k) => ['vector', 'illustration', 'image', 'render'].includes(k))).toHaveLength(KEYWORD_MEDIA_MAX);
    const colors = r.keywords.filter((k) => ['orange', 'black'].includes(k));
    expect(colors).toHaveLength(KEYWORD_COLOR_MAX);
    expect(r.keywords.slice(-KEYWORD_COLOR_MAX)).toEqual(colors);
  });
});

describe('observationGroundingText', () => {
  it('latar dan komposisi tidak ikut teks grounding', () => {
    const t = observationGroundingText({ objects: ['cat'], colors: ['red'], background: 'field', composition: ['centered'] });
    expect(t).toContain('cat');
    expect(t).not.toContain('field');
    expect(t).not.toContain('centered');
  });
});

describe('normalizeLegacyKeywords', () => {
  it('flat lawas: buang spasi/latar/anatomi, dedupe', () => {
    const r = normalizeLegacyKeywords(['Fox', 'red fox', 'background', 'ears', 'fox', 'dengan'], 'adobe');
    expect(r.keywords).toEqual(['fox']);
  });
});

describe('cleanAiTitle', () => {
  it('kapital di awal, tanpa koma', () => {
    expect(cleanAiTitle('a red fox, running at sunrise')).toBe('A red fox running at sunrise');
  });
});

describe('M34 Fase 1a — frasa tiga kata hanya nama observasi/judul', () => {
  const obs3 = {
    objects: ['first aid kit'],
    parts: ['syringe', 'bandage'],
    colors: [] as string[]
  };
  it('persis nama objek → kept; bukan nama → dibuang; cap 3', () => {
    const r = run(
      [
        src('first aid kit', 'visible'),
        src('red big box', 'visible'),
        src('hot air balloon', 'visible')
      ],
      { obs: obs3, canonical: '', themeFit: false, themeEvidence: '', mediaType: 'photo' }
    );
    expect(r.keywords).toContain('first aid kit');
    expect(r.keywords).not.toContain('red big box');
    expect(r.keywords).not.toContain('hot air balloon');
  });

  it('subjek judul: tiga kata yang semua katanya di judul → kept', () => {
    const r = run([src('red big box', 'visible')], {
      obs: { objects: ['box'], colors: [] as string[] },
      canonical: '',
      themeFit: false,
      themeEvidence: '',
      mediaType: 'photo',
      titleText: 'A red big box on a table'
    });
    // 'box' = subjek utama (objects) sehingga frasa lolos komponen, lalu
    // gerbang tiga kata lolos via subjek judul
    expect(r.keywords).toContain('red big box');
  });

  it(`cap frasa-3 = ${KEYWORD_PHRASE3_MAX}`, () => {
    const list = ['first aid kit', 'red big box', 'big red box', 'red box kit'].map((k) =>
      src(k, 'visible')
    );
    const r = run(list, {
      obs: { objects: ['first aid kit', 'red big box', 'big red box', 'red box kit'], colors: [] as string[] },
      canonical: '',
      themeFit: false,
      themeEvidence: '',
      mediaType: 'photo',
      titleText: 'first aid kit red big box big red box red box kit'
    });
    expect(r.keywords.filter((k) => k.split(' ').length === 3)).toHaveLength(KEYWORD_PHRASE3_MAX);
  });

  it('wordsMax 2 = tiga kata selalu dibuang (perilaku dua kata)', () => {
    const r = run([src('first aid kit', 'visible'), src('black cat', 'visible')], {
      obs: { objects: ['first aid kit'], parts: ['black', 'cat'], colors: [] as string[] },
      canonical: '',
      themeFit: false,
      themeEvidence: '',
      mediaType: 'photo'
    }, { wordsMax: 2 });
    expect(r.keywords).not.toContain('first aid kit');
    expect(r.keywords).toContain('black cat');
  });
});

describe('M34 Fase 1c — potongan tak bermakna dibuang kecuali pengecualian', () => {
  const ORPH_OBS = {
    objects: ['first aid kit'],
    parts: ['bag handle', 'box lid', 'syringe'],
    colors: [] as string[]
  };
  const over = {
    obs: ORPH_OBS,
    canonical: '',
    themeFit: false,
    themeEvidence: '',
    mediaType: 'photo'
  };
  it('kit/print/handle dibuang; standalone true ditunda ke Tahap D', () => {
    const r = run(
      [
        src('first aid kit', 'visible'),
        src('kit', 'visible'),
        src('print', 'visible'),
        src('handle', 'visible'),
        src('box', 'visible', { standalone: true }),
        src('syringe', 'visible')
      ],
      over
    );
    expect(r.keywords).toContain('first aid kit');
    expect(r.keywords).toContain('syringe');
    for (const bad of ['kit', 'print', 'handle']) expect(r.keywords).not.toContain(bad);
    // standalone true lolos deterministik + terbawa di items untuk Tahap D
    expect(r.keywords).toContain('box');
    expect(r.items.find((x) => x.k === 'box')?.standalone).toBe(true);
  });

  it('frasa beranggota ORPHAN_HEAD harus persis nama observasi', () => {
    const r = run([src('kit bag', 'visible'), src('gift box', 'visible')], {
      obs: { objects: ['gift box'], parts: [], colors: [] as string[] },
      canonical: '',
      themeFit: false,
      themeEvidence: '',
      mediaType: 'photo'
    });
    expect(r.keywords).not.toContain('kit bag');
    expect(r.keywords).toContain('gift box');
  });
});

describe('M34 Fase 1d — kembar: satu komponen per frasa, subjek dilindungi', () => {
  it('komponen kedua+ yang tak dilindungi dibuang', () => {
    const r = run(
      [
        src('red wine', 'visible'),
        src('red', 'visible'),
        src('wine', 'visible')
      ],
      {
        // 'wine' tercatat sendiri (lolos orphan) sehingga aturan kembar yang bekerja
        obs: { objects: ['bottle'], parts: ['red wine', 'wine'], colors: ['red'] },
        canonical: '',
        themeFit: false,
        themeEvidence: '',
        mediaType: 'photo'
      }
    );
    // frasa + satu komponen (pertama urutan model) tersisa
    expect(r.keywords).toContain('red wine');
    expect(r.keywords).toContain('red');
    expect(r.keywords).not.toContain('wine');
  });

  it('subjek utama dan inti tema tak pernah dibuang aturan kembar', () => {
    const r = run(
      [
        src('black cat', 'visible'),
        src('cat', 'visible'),
        src('black', 'visible')
      ],
      {
        obs: { objects: ['cat'], colors: ['black'] },
        canonical: 'Halloween',
        themeFit: true,
        themeEvidence: 'costume in frame',
        mediaType: 'photo'
      }
    );
    expect(r.keywords).toContain('black cat');
    expect(r.keywords).toContain('cat');
  });
});

describe('M34 Fase 2 — inti tema ≤ posisi 3 meski banyak sekunder', () => {
  it('frasa subjek posisi 1, inti tema posisi 2–3, sekunder ≤3 di 10 teratas', () => {
    const r = run(
      [
        src('syringe', 'visible'),
        src('thermometer', 'visible'),
        src('bandage', 'visible'),
        src('pill', 'visible'),
        src('cross', 'visible'),
        src('first aid kit', 'visible'),
        src('halloween', 'theme', { kind: 'event' }),
        src('kitten', 'synonym', { of: 'first aid kit', rel: 'synonym' }),
        src('celebration', 'theme', { kind: 'event' }),
        src('party', 'theme', { kind: 'activity' }),
        src('giftwrap', 'usage'),
        src('keepsake', 'usage')
      ],
      {
        obs: {
          objects: ['first aid kit', 'medical cross'],
          parts: ['syringe', 'thermometer', 'bandage', 'pill'],
          colors: [] as string[]
        },
        canonical: 'Halloween',
        themeFit: true,
        themeEvidence: 'bat wings in frame',
        mediaType: 'photo',
        titleText: 'Halloween first aid kit with medical tools'
      }
    );
    const kws = r.keywords;
    expect(kws[0]).toBe('first aid kit');
    expect(kws.slice(0, 3)).toContain('halloween');
    const secondaryIn10 = kws.slice(0, 10).filter((k) =>
      ['syringe', 'thermometer', 'bandage', 'pill', 'cross'].includes(k)
    );
    expect(secondaryIn10.length).toBeLessThanOrEqual(3);
  });

  it('kata judul yang tenggelam ditarik ke 10 teratas', () => {
    const els = ['syringe', 'thermometer', 'bandage', 'pill', 'cotton', 'gauze', 'tape', 'tray', 'dropper', 'vial', 'lamp', 'clock'];
    const r = run(
      [
        src('cat', 'visible'),
        ...els.map((k) => src(k, 'visible')),
        src('tray', 'visible')
      ],
      {
        obs: { objects: ['cat'], parts: els, colors: [] as string[] },
        canonical: '',
        themeFit: false,
        themeEvidence: '',
        mediaType: 'photo',
        titleText: 'A cat beside a wooden tray'
      }
    );
    expect(r.keywords.slice(0, 10)).toContain('tray');
  });
});
