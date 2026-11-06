"""Build-time shared family chrome. Static HTML; no remote fetch or runtime dependency."""
from pathlib import Path
from html import escape
import json,re,shutil,hashlib
HERE=Path(__file__).resolve().parent

def apply(out,brand,base='',exclude=()):
 out=Path(out);studios=json.loads((HERE/'studios.json').read_text());assert brand in [s['id'] for s in studios]
 assets=out/'studio-family';assets.mkdir(exist_ok=True);shutil.copyfile(HERE/'family.css',assets/'family.css')
 def link(s):
  href=base+'/' if s['id']==brand else s['url'];current=' aria-current="location"' if s['id']==brand else ''
  return '<a href="'+escape(href)+'"'+current+'>'+escape(s['name'])+'<small>'+escape(s['kind'])+'</small></a>'
 parent=base+'/' if brand=='puzzlecats' else studios[0]['url']
 bar='<nav class="pc-family" aria-label="Puzzle Cats studio family"><div class="pc-family-inner"><a class="pc-family-parent" href="'+parent+'"><span class="pc-family-mark" aria-hidden="true">✦</span> Puzzle Cats<span class="pc-family-context"> / A family of game studios</span></a><details><summary>Explore our studios</summary><div class="pc-family-menu">'+''.join(link(s) for s in studios)+'</div></details></div></nav>'
 footer='<aside class="pc-family-footer" aria-label="More from the Puzzle Cats family"><div class="pc-family-footer-inner"><strong>More ways to play.</strong><p>Explore the Puzzle Cats family: word games, block puzzles, solitaire and driving games, each with a style of its own.</p><nav aria-label="Our family of studios">'+''.join(link(s).replace('<small>'+escape(s['kind'])+'</small>','') for s in studios)+'</nav></div></aside>'
 changed=[]
 for f in out.rglob('*.html'):
  rel=f.relative_to(out).as_posix()
  if any(rel==e or rel.startswith(e.rstrip('/')+'/') for e in exclude):continue
  text=f.read_text()
  if '<body' not in text.lower() or '</body>' not in text.lower():continue
  assert 'class="pc-family"' not in text,'Family chrome must be applied once'
  text=text.replace('</head>','<link rel="stylesheet" href="'+base+'/studio-family/family.css"></head>',1)
  text=re.sub(r'(<body\b[^>]*>)',lambda m:m[1]+bar,text,count=1,flags=re.I)
  text=text.replace('</body>',footer+'</body>',1);f.write_text(text);changed.append(rel)
 manifest={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in HERE.iterdir() if p.is_file() and p.suffix in ['.py','.json','.css'] and p.name!='source-version.json'}
 (assets/'source-version.json').write_text(json.dumps(dict(version=1,brand=brand,source=manifest,pages=changed),indent=2)+'\n')
 return changed
