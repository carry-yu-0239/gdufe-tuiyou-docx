"""Rebuild the offline Carry Lattice edition while preserving the original business scripts."""
from pathlib import Path
import re, hashlib, base64

ROOT = Path(__file__).resolve().parent
source = (ROOT / 'original.html').read_text(encoding='utf-8')
css = (ROOT / 'lattice-theme.css').read_text(encoding='utf-8')
visual = (ROOT / 'lattice-enhancement.generated.js').read_text(encoding='utf-8')
license_text = (ROOT / 'vendor/carry-lattice/LICENSE').read_text(encoding='utf-8')

assert source.count('<script>') == 6
assert 'QingmaDocx' in source and 'QingmaRules' in source

source = source.replace('</style>', '\n' + css + '\n</style>', 1)
source = source.replace('<div class="page-heading">', '''<div class="page-heading">
        <div class="lattice-visual" aria-hidden="true"><canvas id="latticeField"></canvas><div class="lattice-vignette"></div><div class="lattice-coordinate">X: 06 · Y: 2026 &nbsp; / &nbsp; POINT · SET · MAP</div></div>
        <div class="lattice-hero-number" aria-hidden="true"><span class="lattice-step-caption">CURRENT / 06</span><span class="lattice-step-text" id="latticeStepGlyph">01</span></div>''', 1)
source = source.replace('''<div><strong>03</strong> 下载 Word</div></div>''', '''<div><strong>03</strong> 下载 Word</div></div>
        <div class="lattice-meta" aria-hidden="true"><span>EVERGREEN EDITION</span><i class="lattice-divider"></i><span>POINT-DRIVEN INTERFACE</span><i class="lattice-divider"></i><span>OFFLINE FIRST</span></div>''', 1)
source = source.replace('''      <div class="draft-strip">''', '''      <div class="lattice-progress-strip" aria-label="基础资料填写进度"><span class="lattice-progress-label">填写完成度</span><div class="lattice-progress" id="latticeProgress" aria-label="基础资料填写完成度"></div><output id="latticeProgressPercent" class="lattice-progress-percent" aria-hidden="true">0%</output></div>
      <div class="draft-strip">''', 1)
assert source.count('<div class="lattice-progress-strip"') == 1
visual = visual.replace('</script', '<\/script')
source = source.replace('</body>', '\n<script>' + visual + '</script>\n</body>', 1)
source = source.replace('</body>', '\n<!-- Carry Lattice upstream license, source commit 7a424c93b9be13cf835b91ea67495fec2ec0584e\n' + license_text + '\n-->\n</body>', 1)

styles = re.findall(r'<style>(.*?)</style>', source, re.S)
scripts = re.findall(r'<script>(.*?)</script>', source, re.S)
assert len(styles) == 1 and len(scripts) == 7
fmt = lambda v: "'sha256-" + base64.b64encode(hashlib.sha256(v.encode('utf-8')).digest()).decode('ascii') + "'"
source = re.sub(r'(script-src )[^;]+', lambda m: m.group(1) + ' '.join(map(fmt, scripts)), source, count=1)
source = re.sub(r'(style-src )[^;]+', lambda m: m.group(1) + ' '.join(map(fmt, styles)), source, count=1)
source = source.replace('<meta name="theme-color" content="#152a28">', '<meta name="theme-color" content="#f3f7f2">', 1)
source = source.replace('<title>青马工程学员报名表 · 智能填写工具</title>', '<title>青马工程报名表 · Carry Lattice 点阵版</title>', 1)

out = ROOT / 'dist' / 'index.html'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(source, encoding='utf-8', newline='\n')
print(f'Wrote {out}: {out.stat().st_size} bytes, {len(scripts)} inline scripts')
