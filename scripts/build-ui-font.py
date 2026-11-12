"""Build the locally served Noto Sans TC variable font for public UI/content.

Requires fontTools. Extra user-entered characters use the system font fallback.
"""
import json
import tempfile
import urllib.request
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstc/'
DEST = ROOT / 'assets' / 'fonts'
DEST.mkdir(parents=True, exist_ok=True)


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)


text = ''.join((ROOT / name).read_text(encoding='utf-8')
               for name in ['index.html', 'query.html', 'gaps.html'])
for name in ['plants', 'penalties', 'accidents', 'tax-rollup', 'query-rules', 'meta']:
    text += ''.join(strings(json.loads((ROOT / 'data' / (name + '.json')).read_text(encoding='utf-8'))))
unicodes = set(map(ord, text)) | set(range(32, 127))
with tempfile.TemporaryDirectory() as work:
    font_path = Path(work) / 'NotoSansTC.ttf'
    urllib.request.urlretrieve(SOURCE + 'NotoSansTC%5Bwght%5D.ttf', font_path)
    options = subset.Options()
    options.flavor = 'woff'
    font = subset.load_font(str(font_path), options)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    subset.save_font(font, str(DEST / 'noto-sans-tc-ui.woff'), options)
    font.close()
urllib.request.urlretrieve(SOURCE + 'OFL.txt', DEST / 'OFL.txt')
print('Built local variable font:', (DEST / 'noto-sans-tc-ui.woff').stat().st_size, 'bytes')
