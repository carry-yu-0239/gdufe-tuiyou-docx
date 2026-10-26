"""Confirm the design adaptation preserves all six original business scripts."""
from pathlib import Path
import re, hashlib, base64
r=Path(__file__).resolve().parents[1]
original=(r/'original.html').read_text(encoding='utf-8')
output=(r/'dist/index.html').read_text(encoding='utf-8')
a=re.findall(r'<script>(.*?)</script>',original,re.S)
b=re.findall(r'<script>(.*?)</script>',output,re.S)
assert len(a)==6 and len(b)==7 and a==b[:6], 'Original business logic changed'
assert "connect-src 'none'" in output
assert 'word/document.xml' in output and 'latticeProgress' in output
for block in b:
  sha="'sha256-"+base64.b64encode(hashlib.sha256(block.encode('utf-8')).digest()).decode('ascii')+"'"
  assert sha in output, 'CSP integrity failure'
print('PASS: six original scripts unchanged; CSP valid; DOCX engine preserved')
