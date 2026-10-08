#!/usr/bin/env python3
"""版の番号を1つ上げる。

GitHub Pages は CSS と JS をブラウザに保存させるので、更新すると新しいHTMLと
古いJSが混ざって壊れる。読み込み先の `?v=` を上げて避けている。
HTML 自体も最大10分は保存されるため、`version.txt` と `site.js` の BUILD を
突き合わせて、食い違っていたらページ側で読み直す。

    python bump.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
HTML = ['index.html', 'goods.html', 'access.html']

cur = int((ROOT / 'version.txt').read_text(encoding='utf-8').strip())
new = cur + 1

for f in HTML:
    p = ROOT / f
    s = p.read_text(encoding='utf-8')
    s = re.sub(r'(href="style\.css)\?v=\d+(")', rf'\1?v={new}\2', s)
    s = re.sub(r'(src="(?:app|site|map3d)\.js)\?v=\d+(")', rf'\1?v={new}\2', s)
    p.write_text(s, encoding='utf-8', newline='\n')

p = ROOT / 'app.js'
s = p.read_text(encoding='utf-8')
s = re.sub(r"(\./(?:map3d|site)\.js)\?v=\d+", rf'\1?v={new}', s)
p.write_text(s, encoding='utf-8', newline='\n')

p = ROOT / 'site.js'
s = p.read_text(encoding='utf-8')
s, n = re.subn(r"const BUILD = '\d+';", f"const BUILD = '{new}';", s)
if n != 1:
    sys.exit('site.js の BUILD が見つかりません')
p.write_text(s, encoding='utf-8', newline='\n')

(ROOT / 'version.txt').write_text(f'{new}\n', encoding='utf-8', newline='\n')
print(f'{cur} -> {new}')
