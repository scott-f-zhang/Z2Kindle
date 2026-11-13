"""Regenerate the README images (English and Chinese) from the demo project.

    make demo && python3 -I docs/images/src/make_images.py

Needs: the demo built (examples/demo/work, figs), Google Chrome (headless screenshots),
Node deps (resvg for the SVG diagrams), Pillow, and a CJK font (Hiragino Sans GB on macOS,
or set Z2K_FONT=/path/to/font.ttc).
"""
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

TK = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
DEMO = os.path.join(TK, 'examples', 'demo')
OUT = os.path.join(TK, 'docs', 'images')
TMP = os.path.join(DEMO, 'work', 'readme-images')
FONT = os.environ.get('Z2K_FONT') or next((f for f in (
    '/System/Library/Fonts/Hiragino Sans GB.ttc', '/System/Library/Fonts/PingFang.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc') if os.path.exists(f)), None)
CHROME = os.environ.get('CHROME') or next((c for c in (
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', shutil.which('google-chrome') or '',
    shutil.which('chromium') or '') if c and os.path.exists(c)), None)

L = {
    'en': dict(edition='main', inp='Input: slides (PDF / PPTX)', out='Output: notes that read like a book (EPUB / web)',
               cap1='Most content sits in images: bullets and formulas', cap2='The agent reads every page and rewrites it as prose',
               grid='1. figtool grid: page with coordinates; the agent picks a box', crop='2. figtool crop: cut from the hi-res render'),
    'zh': dict(edition='zh', inp='输入：课件（PDF / PPTX）', out='输出：可通读的阅读笔记（EPUB / 网页预览）',
               cap1='大部分内容是图片里的要点和公式', cap2='Agent 逐页看图，改写成连贯的文字',
               grid='1. figtool grid：带坐标网格的页面，Agent 读坐标定裁剪框', crop='2. figtool crop：从高清图裁出'),
}


def font(n):
    return ImageFont.truetype(FONT, n) if FONT else ImageFont.load_default()


def framed(im, pad=2):
    out = Image.new('RGB', (im.width + 2 * pad, im.height + 2 * pad), (190, 190, 190)); out.paste(im, (pad, pad)); return out


def arrow(d, x0, y, x1):
    d.line([(x0, y), (x1 - 18, y)], fill=(55, 71, 79), width=6); d.polygon([(x1, y), (x1 - 26, y - 16), (x1 - 26, y + 16)], fill=(55, 71, 79))


def save(im, name):
    im.convert('RGB').quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(os.path.join(OUT, name), optimize=True)
    print('wrote', os.path.join('docs/images', name))


def pipeline(lang):
    svg = os.path.join(OUT, 'src', f'pipeline.{lang}.svg'); png = os.path.join(TMP, f'pipeline.{lang}.png')
    js = ("const fs=require('fs');const {Resvg}=require('@resvg/resvg-js');"
          f"fs.writeFileSync({png!r},new Resvg(fs.readFileSync({svg!r},'utf8'),{{font:{{loadSystemFonts:true}}}}).render().asPng());")
    subprocess.run(['node', '-e', js], cwd=TK, check=True)
    save(Image.open(png), f'pipeline.{lang}.png')


def slides_to_notes(lang, t):
    shot = os.path.join(TMP, f'web.{lang}.png')
    page = os.path.join(DEMO, 'work', 'web', t['edition'], 'l1_demo_logistic.html')
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
                    '--window-size=760,1500', f'--screenshot={shot}', 'file://' + page], check=True, capture_output=True)
    img = os.path.join(DEMO, 'work', 'img', 'L1_Demo_Logistic')
    sw, gap = 760, 40                                  # slide column as wide as the web column
    s1, s2 = [framed((lambda im: im.resize((sw, round(im.height * sw / im.width))))(Image.open(os.path.join(img, f)).convert('RGB')))
              for f in ('p-01.png', 'p-02.png')]
    colH = s1.height + gap + s2.height                 # both columns end at the same height
    page = Image.open(shot).convert('RGB').crop((0, 0, 760, colH - 4))
    fade = 110                                         # fade the cut-off bottom into white: "continues…"
    white = Image.new('RGB', page.size, 'white')
    mask = Image.new('L', page.size, 0)
    for y in range(fade):
        ImageDraw.Draw(mask).line([(0, page.height - fade + y), (page.width, page.height - fade + y)], fill=round(255 * y / fade))
    web = framed(Image.composite(white, page, mask))
    top = 150
    W, H = 60 + s1.width + 150 + web.width + 60, top + colH + 50
    im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)
    xr = 60 + s1.width + 150
    d.text((60, 40), t['inp'], font=font(30), fill=(31, 41, 51)); d.text((xr, 40), t['out'], font=font(30), fill=(31, 41, 51))
    d.text((60, 92), t['cap1'], font=font(22), fill=(95, 107, 122)); d.text((xr, 92), t['cap2'], font=font(22), fill=(95, 107, 122))
    im.paste(s1, (60, top)); im.paste(s2, (60, top + s1.height + gap))
    arrow(d, 60 + s1.width + 30, top + colH // 2, 60 + s1.width + 125)
    im.paste(web, (xr, top))
    save(im, f'slides-to-notes.{lang}.png')


def figure_crop(lang, t):
    subprocess.run([sys.executable, '-I', os.path.join(TK, 'tools', 'figtool.py'), DEMO, 'grid', 'L1_Demo_Logistic', '2'], check=True, capture_output=True)
    g = framed(Image.open(os.path.join(DEMO, 'work', 'grid', 'L1_Demo_Logistic-p02.png')).convert('RGB'))
    c = Image.open(os.path.join(DEMO, 'figs', 'L1_Demo_Logistic', 'sigmoid.png')).convert('RGB')
    c = framed(c.resize((460, round(c.height * 460 / c.width))))
    W, H = 60 + g.width + 150 + c.width + 60, 110 + g.height + 40
    im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)
    d.text((60, 40), t['grid'], font=font(30), fill=(31, 41, 51)); d.text((60 + g.width + 150, 40), t['crop'], font=font(30), fill=(31, 41, 51))
    im.paste(g, (60, 110)); arrow(d, 60 + g.width + 25, 110 + g.height // 2, 60 + g.width + 125)
    im.paste(c, (60 + g.width + 150, 110 + (g.height - c.height) // 2))
    save(im, f'figure-crop.{lang}.png')


def covers(lang, t):
    d = os.path.join(TMP, f'covers.{lang}')
    subprocess.run(['node', 'build/cover.js', DEMO, '--edition', t['edition'], '--gallery', '--out', d], cwd=TK, check=True, capture_output=True)
    save(Image.open(os.path.join(d, 'contact.png')), f'covers.{lang}.png')


if __name__ == '__main__':
    if not CHROME:
        sys.exit('Google Chrome / Chromium not found (set CHROME=/path/to/chrome)')
    if not os.path.exists(os.path.join(DEMO, 'figs', 'L1_Demo_Logistic', 'sigmoid.png')):
        sys.exit('build the demo first: make demo')
    os.makedirs(TMP, exist_ok=True)
    for lang, t in L.items():
        pipeline(lang); slides_to_notes(lang, t); figure_crop(lang, t); covers(lang, t)
