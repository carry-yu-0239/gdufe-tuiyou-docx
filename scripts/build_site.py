"""Bundle the local-only form as one static, offline-capable HTML file."""
from pathlib import Path
import base64
import hashlib
import re
import shutil

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'src'
OUTPUT = ROOT / 'dist'
OUTPUT.mkdir(exist_ok=True)

html = (SOURCE / 'index.html').read_text(encoding='utf-8')
html = html.replace('<a class="back" href="../index.html">← 团委学生工作台</a>', '<a class="back" href="https://github.com/carry-yu-0239/gdufe-tuiyou-docx" target="_blank" rel="noopener noreferrer">项目与使用说明 ↗</a>')
hashes = []

def inline_script(match):
    code = (SOURCE / match.group(1)).read_text(encoding='utf-8').replace('</script', '<\\/script')
    digest = base64.b64encode(hashlib.sha256(code.encode('utf-8')).digest()).decode('ascii')
    hashes.append("'sha256-" + digest + "'")
    return '<script>' + code + '</script>'

html = re.sub(r'<script defer src="([^"]+)"></script>', inline_script, html)
css = (SOURCE / 'styles.css').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + css + '</style>')
html = html.replace("script-src 'self'", 'script-src ' + ' '.join(hashes))
css_hash = base64.b64encode(hashlib.sha256(css.encode('utf-8')).digest()).decode('ascii')
html = html.replace("style-src 'self'", "style-src 'sha256-" + css_hash + "'")

# Run each embedded script in source order after the form's DOM is available.
scripts = re.findall(r'<script>[\s\S]*?</script>', html)
html = re.sub(r'<script>[\s\S]*?</script>', '', html)
html = html.replace('</body>', ''.join(scripts) + '</body>')
(OUTPUT / 'index.html').write_text(html, encoding='utf-8', newline='\n')
(OUTPUT / '.nojekyll').write_text('', encoding='utf-8')
shutil.copy2(ROOT / '使用说明.md', OUTPUT / '使用说明.md')
for name in ['fflate-LICENSE.txt', 'pdf-lib-LICENSE.md']:
    shutil.copy2(SOURCE / 'vendor' / name, OUTPUT / name)
print('Static site bundled into dist/ (no runtime network dependencies).')
