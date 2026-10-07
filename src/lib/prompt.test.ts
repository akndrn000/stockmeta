import { describe, expect, it } from 'vitest';
import { ADOBE_CATEGORIES, SHUTTERSTOCK_CATEGORIES } from './categories';
import { MAX_DESCRIPTION_SHUTTER, MAX_KEYWORDS, MAX_KEYWORDS_ADOBE, MAX_TITLE_CSV, PROMPT_TARGET_ADOBE_MIN, PROMPT_TARGET_SHUTTER_MIN, SS_DESCRIPTION_SUGGEST, TARGET_KEYWORDS_MAX } from './limits';
import { buildMetadataPrompt, buildVerifyPrompt, parseMetadataResponse } from './prompt';
import { STAGE_B_WITH_IMAGE } from './providers/models';

describe('buildMetadataPrompt', () => {
  it('adobe: platform target, aturan anti-generic, daftar kategori + format title', () => {
    const p = buildMetadataPrompt({ platform: 'adobe' });
    expect(p).toContain('Platform target: adobe');
    expect(p).toContain('ATURAN PENTING UNTUK TITLE/DESCRIPTION:');
    expect(p).toContain(ADOBE_CATEGORIES.join(', '));
    // M24 (koreksi M9a — contoh CSV resmi Adobe): judul maks 200 karakter, koma
    // dibiarkan, keywords maks 49 yang paling penting dulu
    expect(p).toContain(`"title": string maks ${MAX_TITLE_CSV} karakter`);
    expect(p).toContain(`maksimal ${MAX_KEYWORDS_ADOBE} kata`);
    expect(p).not.toContain('TANPA koma');
    // Fase 4: judul AI tanpa koma (kapital di awal)
    expect(p).toContain('tanpa koma');
  });

  it('shutterstock: daftar kategori sendiri + format description + wajib TEPAT 2 kategori', () => {
    const p = buildMetadataPrompt({ platform: 'shutterstock' });
    expect(p).toContain('Platform target: shutterstock');
    expect(p).toContain(SHUTTERSTOCK_CATEGORIES.join(', '));
    expect(p).not.toContain(ADOBE_CATEGORIES.join(', '));
    // Fase 4: deskripsi satu kalimat Inggris natural, minimal 5 kata
    expect(p.toLowerCase()).toContain('satu kalimat');
    expect(p).toContain('minimal 5 kata');
    // M33: pagar 2048 + ideal 100–250, tanpa perintah deskripsi panjang
    expect(p).toContain(`pagar ${MAX_DESCRIPTION_SHUTTER} karakter`);
    expect(p).toContain(`ideal ${SS_DESCRIPTION_SUGGEST.MIN}–${SS_DESCRIPTION_SUGGEST.MAX} karakter`);
    expect(p.toLowerCase()).not.toContain('tulis deskripsi sepanjang');
    expect(p).toContain('TEPAT 2');
    expect(p).toContain('BERBEDA');
  });

  it('tema kosong: blok tema tidak dikirim sama sekali', () => {
    const p = buildMetadataPrompt({ platform: 'adobe', theme: '' });
    expect(p).not.toContain('Tema utama dari kontributor');
    expect(p).not.toContain('ABAIKAN tema ini');
  });

  it('tema terisi: tiga baris tema muncul', () => {
    const p = buildMetadataPrompt({ platform: 'adobe', theme: 'Harvest Festival' });
    expect(p).toContain('Tema utama dari kontributor: "Harvest Festival".');
    expect(p).toContain('KEMBANGKAN keyword dan title/description');
    expect(p).toContain('ABAIKAN tema ini sepenuhnya');
  });

  it('Fase 3: instruksi Inggris ada paling atas dan diulang di akhir (kedua platform)', () => {
    for (const platform of ['adobe', 'shutterstock'] as const) {
      const p = buildMetadataPrompt({ platform, theme: 'Panen Raya' });
      const needle =
        'Tulis SELURUH output (title/description, keywords) dalam bahasa Inggris. Jika tema diberikan dalam bahasa lain, terjemahkan ke istilah Inggris baku.';
      expect(p.startsWith(needle)).toBe(true);
      expect(p.trimEnd().endsWith(needle)).toBe(true);
      // muncul minimal dua kali (atas + akhir)
      expect(p.split(needle).length - 1).toBeGreaterThanOrEqual(2);
    }
  });

  it('Fase 3: languageFix menambah instruksi koreksi bahasa', () => {
    const p = buildMetadataPrompt({ platform: 'adobe', languageFix: true });
    expect(p).toContain('Koreksi bahasa');
  });

  it('M33: Tahap B menilai gambar saat STAGE_B_WITH_IMAGE true', () => {
    expect(STAGE_B_WITH_IMAGE).toBe(true);
    const p = buildMetadataPrompt({ platform: 'adobe', theme: 'Panen Raya' });
    expect(p).toContain('MELIHAT gambar terlampir');
  });

  it('M33: aturan rel/kind + larangan lintas jenis + contoh lintas domain', () => {
    const p = buildMetadataPrompt({ platform: 'adobe' });
    expect(p).toContain('"rel"');
    expect(p).toContain('"kind"');
    expect(p).toContain('puppy');
    expect(p).toContain('lemon');
    expect(p).toContain('truck');
  });

  it('M33 buildVerifyPrompt: minta {"remove"} dengan daftar + pengamatan', () => {
    const p = buildVerifyPrompt({ keywords: ['cat', 'puppy'], observation: 'cat whiskers', mediaType: 'photo' });
    expect(p).toContain('{"remove": [...]}');
    expect(p).toContain('cat, puppy');
  });

  it('M32: Tahap A pengamatan diperkaya + Tahap B aturan satu kata & sumber', () => {
    for (const platform of ['adobe', 'shutterstock'] as const) {
      const p = buildMetadataPrompt({ platform, theme: 'Panen Raya' });
      expect(p).toContain('TAHAP A');
      expect(p).toContain('"parts"');
      expect(p).toContain('"materials"');
      expect(p).toContain('"media_type"');
      expect(p).toContain('TAHAP B');
      expect(p).toContain('HANYA SATU KATA');
      expect(p).toContain('"usage"');
      expect(p).toContain('DILARANG MENGARANG');
      // Target per platform: Adobe 35–49, Shutterstock 25–50
      const want = platform === 'adobe'
        ? `ANTARA ${PROMPT_TARGET_ADOBE_MIN} SAMPAI ${TARGET_KEYWORDS_MAX}`
        : `ANTARA ${PROMPT_TARGET_SHUTTER_MIN} SAMPAI ${MAX_KEYWORDS}`;
      expect(p).toContain(want);
      expect(p).toContain('boleh multikata');
      // tanpa contoh terikat tema
      expect(p.toLowerCase()).not.toContain('halloween');
      expect(p.toLowerCase()).not.toContain('christmas');
      expect(p.toLowerCase()).not.toContain('pumpkin');
    }
  });

  it('M34: standalone + aturan potongan lintas domain + Tahap D bermakna', () => {
    for (const platform of ['adobe', 'shutterstock'] as const) {
      const p = buildMetadataPrompt({ platform, theme: 'Panen Raya' });
      expect(p).toContain('"standalone"');
      expect(p).toContain('first aid kit');
      expect(p).toContain('paw print');
      expect(p).toContain('bag handle');
    }
    const d = buildVerifyPrompt({ keywords: ['cat'], observation: 'cat', mediaType: 'photo' });
    expect(d).toContain('BUKAN istilah pencarian bermakna sendirian');
    expect(d).toContain('kembaran yang tidak menambah nilai pencarian');
  });
});

describe('parseMetadataResponse', () => {
  it('JSON ber-fence markdown: trim title, dedupe keyword, fuzz kategori', () => {
    const raw = '```json\n{"title":"  Kucing lucu  ","keywords":["kucing"," kucing ","meja","KUCING"],'
      + '"category":"buildings and architecture"}\n```';
    const p = parseMetadataResponse(raw, 'adobe');
    expect(p.title).toBe('Kucing lucu');
    expect(p.keywords).toEqual(['kucing', 'meja']);
    expect(p.category).toBe('Buildings and Architecture');
  });

  it('tanpa fence, teks di sekitar JSON, keyword string dipisah koma/titik koma', () => {
    const raw = 'Berikut hasilnya: {"keywords": "kucing; meja, kucing", "description": " Seekor kucing di meja "} — selesai';
    const p = parseMetadataResponse(raw, 'shutterstock');
    expect(p.keywords).toEqual(['kucing', 'meja']);
    expect(p.description).toBe('Seekor kucing di meja');
    // M11: kategori kosong dari model tidak dibiarkan kosong — fallback + tanda periksa ulang
    expect(p.category).toBe(SHUTTERSTOCK_CATEGORIES[0]);
    expect(p.categoryAuto).toBe(true);
  });

  it('JSON rusak / tanpa objek → Error "JSON tidak valid"', () => {
    expect(() => parseMetadataResponse('{"title": "x",}', 'adobe')).toThrow('JSON tidak valid');
    expect(() => parseMetadataResponse('bukan json sama sekali', 'adobe')).toThrow('JSON tidak valid');
  });

  it('keyword dibatasi per platform (adobe 49, shutterstock 50) dan kategori array ambil yang pertama lolos', () => {
    const kw = Array.from({ length: 60 }, (_, i) => 'kata' + i);
    const p = parseMetadataResponse(JSON.stringify({ keywords: kw }), 'adobe');
    expect(p.keywords).toHaveLength(MAX_KEYWORDS_ADOBE);

    const s = parseMetadataResponse(JSON.stringify({ keywords: kw }), 'shutterstock');
    expect(s.keywords).toHaveLength(50);

    const c = parseMetadataResponse(JSON.stringify({ category: ['Food & Drink', 'zzz-none'] }), 'shutterstock');
    expect(c.category).toBe('Food and Drink');
  });

  it('kategori dari model tidak mirip → fallback kategori resmi pertama + tanda categoryAuto', () => {
    const p = parseMetadataResponse(JSON.stringify({ category: 'zzzz qqqq' }), 'adobe');
    expect(p.category).toBe(ADOBE_CATEGORIES[0]);
    expect(p.categoryAuto).toBe(true);
  });

  it('kategori cocok → tanpa tanda categoryAuto', () => {
    const p = parseMetadataResponse(JSON.stringify({ category: 'Animals' }), 'adobe');
    expect(p.category).toBe('Animals');
    expect(p.categoryAuto).toBeUndefined();
  });

  it('M11: key `categories` (Shutterstock) diterima sebagai alias `category`', () => {
    const p = parseMetadataResponse(JSON.stringify({ categories: ['Nature', 'Objects'] }), 'shutterstock');
    expect(p.category).toBe('Nature');
    expect(p.categories).toEqual(['Nature', 'Objects']);
    expect(p.categoryAuto).toBeUndefined();
  });

  it('Fase 1: Shutterstock tepat 2 berbeda — duplikat dibuang + tandai kurang, kosong fallback bertanda', () => {
    const two = parseMetadataResponse(JSON.stringify({ category: ['Nature', 'Nature', 'Objects'] }), 'shutterstock');
    expect(two.categories).toEqual(['Nature', 'Objects']);
    expect(two.categoryAuto).toBeUndefined();

    const one = parseMetadataResponse(JSON.stringify({ category: ['Nature'] }), 'shutterstock');
    expect(one.categories).toEqual(['Nature']);
    expect(one.categoryAuto).toBe(true);

    const single = parseMetadataResponse(JSON.stringify({ category: 'Nature' }), 'shutterstock');
    expect(single.categories).toEqual(['Nature']);
    expect(single.categoryAuto).toBe(true);
  });

  it('M11: kategori kosong/null dari model → fallback bertanda', () => {
    const empty = parseMetadataResponse(JSON.stringify({ category: '' }), 'adobe');
    expect(empty.category).toBe(ADOBE_CATEGORIES[0]);
    expect(empty.categoryAuto).toBe(true);

    const nulled = parseMetadataResponse(JSON.stringify({ category: null }), 'shutterstock');
    expect(nulled.category).toBe(SHUTTERSTOCK_CATEGORIES[0]);
    expect(nulled.categoryAuto).toBe(true);
  });

  it('adobe: koma di judul dipertahankan (M24 — CSV di-quote, tak perlu dibersihkan)', () => {
    const p = parseMetadataResponse(JSON.stringify({ title: 'Kopi, susu, dan roti' }), 'adobe');
    expect(p.title).toBe('Kopi, susu, dan roti');
  });

  it('adobe: judul dibatasi 200 karakter', () => {
    const p = parseMetadataResponse(JSON.stringify({ title: 'Kopi, '.repeat(50) }), 'adobe');
    expect(p.title).toContain(',');
    expect(p.title!.length).toBeLessThanOrEqual(MAX_TITLE_CSV);
    expect(p.title!.length).toBe(MAX_TITLE_CSV);
  });

  it('M32: keywords objek {k, src, of?} diparsing; entri tanpa src sah dilewati', () => {
    const raw = JSON.stringify({
      keywords: [
        { k: 'fox', src: 'visible' },
        { k: 'canine', src: 'synonym', of: 'fox' },
        { k: 'mystery' },
        { k: 'ghost', src: 'haunting' }
      ]
    });
    const p = parseMetadataResponse(raw, 'adobe');
    expect(p.sourcedKeywords).toEqual([
      { k: 'fox', src: 'visible' },
      { k: 'canine', src: 'synonym', of: 'fox' }
    ]);
    expect(p.keywords).toBeUndefined();
  });

  it('M32: keywords string flat lawas tetap diterima', () => {
    const p = parseMetadataResponse(JSON.stringify({ keywords: ['fox', 'wolf'] }), 'adobe');
    expect(p.keywords).toEqual(['fox', 'wolf']);
    expect(p.sourcedKeywords).toBeUndefined();
  });

  it('M33: respons Tahap D {"remove"} diparsing; rel/kind tidak valid diabaikan parser', () => {
    const d = parseMetadataResponse(JSON.stringify({ remove: ['puppy', 'ghost', ''] }), 'adobe');
    expect(d.stageRemove).toEqual(['puppy', 'ghost']);
    const r = parseMetadataResponse(JSON.stringify({
      keywords: [{ k: 'kitten', src: 'synonym', of: 'cat', rel: 'cousin', kind: 'party' }]
    }), 'adobe');
    expect(r.sourcedKeywords).toEqual([{ k: 'kitten', src: 'synonym', of: 'cat' }]);
  });

  it('M34: field standalone boolean diparsing (true/false, non-boolean diabaikan)', () => {
    const p = parseMetadataResponse(JSON.stringify({
      keywords: [
        { k: 'box', src: 'visible', standalone: true },
        { k: 'kit', src: 'visible', standalone: false },
        { k: 'print', src: 'visible', standalone: 'yes' }
      ]
    }), 'adobe');
    expect(p.sourcedKeywords).toEqual([
      { k: 'box', src: 'visible', standalone: true },
      { k: 'kit', src: 'visible' },
      { k: 'print', src: 'visible' }
    ]);
  });
  it('M32: observasi diperkaya + tahan alias lama (medium/media_type)', () => {
    const p = parseMetadataResponse(JSON.stringify({
      observation: {
        objects: ['fox'], parts: ['ears'], patterns: [], materials: ['fur'],
        shapes: [], styles: [], moods: ['calm'], usages: ['poster'],
        colors: ['red'], media_type: 'photo', background: 'field', composition: ['rule of thirds']
      }
    }), 'adobe');
    expect(p.observation?.objects).toEqual(['fox']);
    expect(p.observation?.parts).toEqual(['ears']);
    expect(p.observation?.media_type).toBe('photo');
    // data lama tetap diterima (alias medium → media_type)
    const old = parseMetadataResponse(JSON.stringify({ observation: { medium: 'vector' } }), 'adobe');
    expect(old.observation?.media_type).toBe('vector');
  });

  it('visible_facts ditulis dulu + urutan skema: fakta, judul, keywords, kategori', () => {
    for (const platform of ['adobe', 'shutterstock'] as const) {
      const p = buildMetadataPrompt({ platform, theme: 'Panen Raya' });
      expect(p).toContain('visible_facts');
      expect(p).toContain('Tulis DULU "visible_facts"');
      const anchor = platform === 'adobe' ? '"title"' : '"description"';
      expect(p.indexOf('visible_facts')).toBeLessThan(p.indexOf(anchor));
      expect(p.indexOf(anchor)).toBeLessThan(p.indexOf('"keywords"'));
      expect(p.indexOf('"keywords"')).toBeLessThan(p.indexOf('"category"'));
    }
  });

  it('aturan keyword fakta: dasar, warna per bagian, klaim, akurasi-dulu, urutan, generik akhir', () => {
    for (const platform of ['adobe', 'shutterstock'] as const) {
      const p = buildMetadataPrompt({ platform });
      expect(p).toContain('visible_facts');
      expect(p).not.toContain('18 sampai 28');
      expect(p).toContain('Jangan tambahkan kata kunci yang tidak relevan');
      expect(p).toContain('kualitas dan relevansi lebih penting');
      expect(p).toContain('menempel pada bagiannya');
      expect(p).toContain('Bila ragu, pakai istilah umum');
      expect(p).toContain('Keyword pertama harus berasal dari subjek');
      expect(p).toContain('10 teratas (Adobe) / 7 teratas (Shutterstock)');
      expect(p).toContain('Warna dan klaim spesifik di judul/deskripsi HANYA dari visible_facts');
    }
  });

  it('target keyword per platform tegas + akurat + sudut pengembangan', () => {
    const adobe = buildMetadataPrompt({ platform: 'adobe' });
    expect(adobe).toContain(`ANTARA ${PROMPT_TARGET_ADOBE_MIN} SAMPAI ${TARGET_KEYWORDS_MAX}`);
    const shutter = buildMetadataPrompt({ platform: 'shutterstock' });
    expect(shutter).toContain(`ANTARA ${PROMPT_TARGET_SHUTTER_MIN} SAMPAI ${MAX_KEYWORDS}`);
    for (const p of [adobe, shutter]) {
      expect(p).toContain('kecuali gambar benar-benar sangat sederhana');
      expect(p).toContain('HARUS akurat dan benar-benar relevan');
      expect(p).toContain('JANGAN mengarang kata kunci yang tidak berhubungan');
      expect(p).toContain('paling relevan/spesifik dulu');
      expect(p).toContain('Kembangkan dari berbagai sudut');
      expect(p).toContain('aksi/pose');
      expect(p).toContain('gaya visual');
      expect(p).toContain('kategori penggunaan');
    }
  });

  it('shutterstock: deskripsi TIDAK BOLEH berkoma + satu kalimat mengalir', () => {
    const p = buildMetadataPrompt({ platform: 'shutterstock' });
    expect(p).toContain('TIDAK BOLEH mengandung tanda koma sama sekali');
    expect(p).toContain('SATU kalimat mengalir alami');
    expect(p).toContain('kata sambung');
    expect(p).toContain('konsisten dengan tema yang diberikan');
    const a = buildMetadataPrompt({ platform: 'adobe' });
    expect(a).not.toContain('TIDAK BOLEH mengandung tanda koma sama sekali');
  });

  it('shutterstock: parser membersihkan koma deskripsi otomatis', () => {
    const p = parseMetadataResponse(JSON.stringify({
      description: 'A cat sitting on a table, with soft light, and a calm mood',
      category: ['Nature', 'Objects']
    }), 'shutterstock');
    expect(p.description).not.toContain(',');
    expect(p.description).toContain('soft light');
  });

  it('visible_facts diparsing (dibatasi) dan tahan respons lama tanpanya', () => {
    const p = parseMetadataResponse(JSON.stringify({
      title: 'Orange Cat',
      visible_facts: ['orange cat', 'bat wings', '  ', 7],
      keywords: ['cat'],
      category: 'Animals'
    }), 'adobe');
    expect(p.visible_facts).toEqual(['orange cat', 'bat wings', '7']);
    const old = parseMetadataResponse(JSON.stringify({ keywords: ['cat'] }), 'adobe');
    expect(old.visible_facts).toBeUndefined();
  });
});

describe('kata kunci spesifik: larangan generik, urutan, tema konteks, contoh', () => {
  it('larangan generik eksplisit + dimensi analisis gambar', () => {
    for (const platform of ['adobe', 'shutterstock'] as const) {
      const p = buildMetadataPrompt({ platform });
      for (const w of ['beautiful', 'nice', 'stock', 'concept', 'photo', 'design']) {
        expect(p).toContain(w);
      }
      expect(p).toContain('DILARANG kata generik');
      expect(p).toContain('bahan/tekstur');
      expect(p).toContain('suasana');
      expect(p).toContain('gaya visual');
      expect(p).toContain('DILARANG menebak merek');
      expect(p).toContain('tempat spesifik yang tidak terlihat');
      expect(p).toContain('tanpa tanda baca');
      expect(p).toContain('Dedup SECARA MAKNA');
    }
  });

  it('urutan relevansi: 10 pertama frasa pencarian pembeli, keyword pertama dari subjek', () => {
    for (const platform of ['adobe', 'shutterstock'] as const) {
      const p = buildMetadataPrompt({ platform });
      expect(p).toContain('10 kata pertama');
      expect(p).toContain('Keyword pertama harus berasal dari subjek');
    }
  });

  it('tema sebagai konteks: dipakai hanya bila relevan, bukan paksaan', () => {
    const p = buildMetadataPrompt({ platform: 'adobe', theme: 'Harvest Festival' });
    expect(p).toContain('hanya konteks tambahan untuk foto ini');
    expect(p).toContain('HANYA bila relevan dengan foto ini');
    expect(p).not.toMatch(/wajib.*semua foto/i);
  });

  it('contoh: 2 baik + 1 buruk beserta alasannya', () => {
    for (const platform of ['adobe', 'shutterstock'] as const) {
      const p = buildMetadataPrompt({ platform });
      expect(p).toContain('BAIK 1');
      expect(p).toContain('BAIK 2');
      expect(p).toContain('BURUK');
      expect(p).toContain('Alasan baik');
      expect(p).toContain('Alasan buruk');
    }
  });

  it('PERAN + TUGAS + ATURAN + FORMAT terstruktur', () => {
    for (const platform of ['adobe', 'shutterstock'] as const) {
      const p = buildMetadataPrompt({ platform });
      expect(p).toContain('PERAN:');
      expect(p).toContain('TUGAS:');
      expect(p).toContain('ATURAN KATA KUNCI');
      expect(p).toContain('ATURAN PENTING UNTUK TITLE/DESCRIPTION:');
      expect(p).toContain('Format JSON untuk platform ini:');
      expect(p).toContain('CONTOH');
    }
  });

  it('JSON terpotong → Error kind json (di-retry pipeline, bukan hasil diam-diam)', () => {
    const cut = '{"title": "Red bicycle", "keywords": ["bicycle", "red';
    let kind = '';
    try {
      parseMetadataResponse(cut, 'adobe');
    } catch (e) {
      kind = (e as { kind?: string }).kind ?? '';
    }
    expect(kind).toBe('json');
  });

  it('tanda baca tepi keyword dibersihkan, isi tengah dipertahankan', () => {
    const p = parseMetadataResponse(JSON.stringify({
      keywords: ['"bicycle"', '(commute)', 't-shirt', 'vintage!'],
      category: 'Animals'
    }), 'adobe');
    expect(p.keywords).toEqual(['bicycle', 'commute', 't-shirt', 'vintage']);
  });
});
