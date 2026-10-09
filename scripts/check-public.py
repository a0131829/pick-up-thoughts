from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1]
for p in [*root.joinpath('src').rglob('*'),*root.joinpath('public/local').rglob('*')]:
 if p.is_file() and p.suffix in {'.ts','.tsx','.css','.json','.svg'}:
  text=p.read_text();assert not re.search(r'/Users/|obsidian://|rec_[0-9a-f]{16}|user_38xz|127\.0\.0\.1:8766|sk-[A-Za-z0-9]{16}',text),p
records=json.loads((root/'public/local/archive.json').read_text())['records'];ids={r['id'] for r in records};assert len(ids)==27
assert all(i.startswith('demo-') for i in ids)
for n in json.loads((root/'public/local/thought-network.json').read_text()):assert set(n['recordIds'])<=ids
for w in json.loads((root/'public/local/gallery.json').read_text()):assert w['id'].startswith('demo-work-') and (root/'public'/w['cover'].lstrip('/')).is_file()
print('PASS: synthetic fixtures, valid references, no private archive identifiers or local paths')
