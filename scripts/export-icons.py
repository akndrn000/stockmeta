"""Ekspor sekali pakai: turunkan PNG/ICO dari geometri ikon StockMeta (64-grid).

Sumber kebenaran bentuk: src/app/icon.svg (kotak hijau #20e875 + glif #04120a:
bingkai foto + batang label). Skrip ini menggambar ulang geometri yang SAMA
dengan Pillow (supersample lalu downscale) supaya tajam tanpa rasterizer SVG.

Pakai:  python scripts/export-icons.py   (dari root repo)
Butuh:  Pillow saja (sudah ada di env ini). Tidak menyentuh package.json,
tidak ikut build Next. Modul python `playwright` tidak tersedia di env ini
dan tidak dibutuhkan — Pillow deterministik dan tanpa browser.

Keluaran:
  src/app/favicon.ico            16/32/48 px (PNG di dalam ICO), sudut bulat
  src/app/apple-icon.png         180x180, full-bleed (iOS membulatkan sendiri)
  public/icon-192.png            192x192 full-bleed
  public/icon-512.png            512x512 full-bleed
  public/icon-maskable-512.png   512x512 full-bleed (glif di dalam safe-area 80%)
  src/app/opengraph-image.png    1200x630
  docs/images/social-preview.png patch logo 1280x640 (hanya area logo 42 px)
"""

from __future__ import annotations

import statistics
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC_APP = ROOT / "src" / "app"
PUBLIC = ROOT / "public"
DOCS_IMG = ROOT / "docs" / "images"

GREEN = "#20e875"
INK = "#04120a"
BG_DARK = "#050907"
TEXT_MAIN = "#e8f2eb"
TEXT_MUT = "#a0b5a6"

# Geometri 64-grid (sama persis dengan src/app/icon.svg)
FRAME = (14, 13, 28, 27, 6)  # x, y, w, h, stroke
BAR = (14, 36, 37, 11, 2)  # x, y, w, h, radius
BG_RX = 14


def _draw_mark(size: int, *, full_bleed: bool, ss: int = 4) -> Image.Image:
    """Gambar ikon persegi `size` px. full_bleed: hijau sampai tepi (PWA/Apple)."""
    big = size * ss
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    k = big / 64  # px per unit grid (supersampled)
    if full_bleed:
        d.rectangle([0, 0, big - 1, big - 1], fill=GREEN)
    else:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=BG_RX * k, fill=GREEN)
    fx, fy, fw, fh, fs = FRAME
    d.rectangle(
        [fx * k, fy * k, (fx + fw) * k, (fy + fh) * k],
        outline=INK,
        width=max(1, round(fs * k)),
    )
    bx, by, bw, bh, br = BAR
    d.rounded_rectangle(
        [bx * k, by * k, (bx + bw) * k, (by + bh) * k],
        radius=br * k,
        fill=INK,
    )
    return img.resize((size, size), Image.LANCZOS)


def _font(bold: bool, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    cands = (
        ["C:/Windows/Fonts/consolab.ttf"] if bold else ["C:/Windows/Fonts/consola.ttf"]
    )
    for p in cands:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make_favicon() -> None:
    imgs = [_draw_mark(s, full_bleed=False) for s in (48, 16, 32)]
    # Pillow menyusun entri PNG-terkompresi di dalam ICO (disukai bookmark modern).
    imgs[0].save(SRC_APP / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)],
                 append_images=[imgs[1], imgs[2]])


def make_pwa() -> None:
    PUBLIC.mkdir(exist_ok=True)
    _draw_mark(180, full_bleed=True).convert("RGB").save(SRC_APP / "apple-icon.png")
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512),
                       ("icon-maskable-512.png", 512)):
        _draw_mark(size, full_bleed=True, ss=2).convert("RGB").save(PUBLIC / name)


def make_og() -> None:
    W, H, SS = 1200, 630, 2
    img = Image.new("RGB", (W * SS, H * SS), BG_DARK)
    mark = _draw_mark(192, full_bleed=False)
    img.paste(mark.resize((192 * SS, 192 * SS), Image.LANCZOS),
              (84 * SS, (H - 192) // 2 * SS), mark.resize((192 * SS, 192 * SS), Image.LANCZOS))
    d = ImageDraw.Draw(img)
    f_title = _font(True, 88 * SS)
    f_sub = _font(False, 31 * SS)
    tx = (84 + 192 + 56) * SS
    title = "StockMeta"
    sub = "AI metadata untuk Adobe Stock dan Shutterstock"
    tb = d.textbbox((0, 0), title, font=f_title)
    sb = d.textbbox((0, 0), sub, font=f_sub)
    gap = 22 * SS
    block = (tb[3] - tb[1]) + gap + (sb[3] - sb[1])
    ty = (H * SS - block) // 2
    d.text((tx, ty), title, font=f_title, fill=TEXT_MAIN)
    d.text((tx, ty + (tb[3] - tb[1]) + gap), sub, font=f_sub, fill=TEXT_MUT)
    img.resize((W, H), Image.LANCZOS).save(SRC_APP / "opengraph-image.png")


def patch_social_preview() -> None:
    """Ganti logo centang lama (kotak ~42 px) dengan ikon baru; sisa piksel utuh."""
    p = DOCS_IMG / "social-preview.png"
    img = Image.open(p).convert("RGB")
    assert img.size == (1280, 640), img.size
    box = (104, 229, 153, 277)  # bbox logo lama (diukur: x 107-150, y 232-274)
    px = img.load()
    ring: list[tuple[int, int, int]] = []
    for y in range(box[1] - 8, box[3] + 8):
        for x in range(box[0] - 8, box[2] + 8):
            if x < box[0] or x >= box[2] or y < box[1] or y >= box[3]:
                ring.append(px[x, y])  # type: ignore[index]
    bg = tuple(int(statistics.median(c)) for c in zip(*ring))
    d = ImageDraw.Draw(img)
    d.rectangle(box, fill=bg)
    mark = _draw_mark(42, full_bleed=False)
    img.paste(mark, (107, 232), mark)  # tengah logo lama ((107+150)/2, (232+274)/2)
    img.save(p)


if __name__ == "__main__":
    make_favicon()
    make_pwa()
    make_og()
    patch_social_preview()
    print("ok: favicon.ico, apple-icon.png, icon-192/512, icon-maskable-512, "
          "opengraph-image.png, social-preview.png")
