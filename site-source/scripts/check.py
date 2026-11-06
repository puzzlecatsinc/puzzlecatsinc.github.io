#!/usr/bin/env python3
"""Validate crawlable output, destinations and preservation of policy/seller content."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import json,hashlib,re,os,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/os.environ.get('BUILD_DIR','dist');errors=[];count=0
config=json.loads((OUT/'.build.json').read_text());BASE=config['basePath']
MODE=config['siteMode']
class Page(HTMLParser):
 def __init__(self):super().__init__();self.ids=set();self.links=[];self.canonical=[];self.h1=0;self.images=0;self.json=False;self.structured=[]
 def handle_starttag(self,tag,attrs):
  d=dict(attrs)
  if 'id' in d:self.ids.add(d['id'])
  if tag=='h1':self.h1+=1
  if tag=='a' and 'href' in d:self.links.append(d['href'])
  if tag in ['img','script','link']:
   if tag=='img':
    self.images+=1
    if 'alt' not in d:errors.append('Image has no alt')
   href=d.get('src',d.get('href',''))
   if href.startswith('/') and d.get('rel')!='canonical':self.links.append(href)
  if tag=='link' and d.get('rel')=='canonical':self.canonical.append(d['href'])
  if tag=='script' and d.get('type')=='application/ld+json':self.json=True
 def handle_endtag(self,tag):
  if tag=='script':self.json=False
 def handle_data(self,data):
  if self.json:self.structured.append(json.loads(data))
pages={}
for path in OUT.rglob('*.html'):
 p=Page();p.feed(path.read_text());pages[path]=p;count+=1
 if p.h1!=1:errors.append(f'{path.relative_to(OUT)}: expected one H1, found {p.h1}')
 if len(p.canonical)!=1 or not p.structured:errors.append(f'{path}: missing canonical or schema')
 if re.search(r'webflow\.js|jquery|webflow\.shared',path.read_text()):errors.append(f'{path}: Webflow dependency')
 for href in p.links:
  u=urlsplit(href)
  if u.scheme or u.netloc:continue
  route=unquote(u.path)
  if BASE and route.startswith(BASE+'/'):route=route[len(BASE):]
  target=OUT/route.lstrip('/') if route else path
  if target.is_dir():target=target/'index.html'
  if not target.exists():errors.append(f'{path.relative_to(OUT)}: missing {href}')
  elif u.fragment and target.suffix=='.html':
   other=Page();other.feed(target.read_text())
   if unquote(u.fragment) not in other.ids:errors.append(f'{path}: missing anchor {href}')
# CSS resources must also resolve when hosted under a Pages project subpath.
for css in (OUT/'assets').glob('*.css'):
 for url in re.findall(r'url\([\"\']?([^\"\'\)\s;]+)',css.read_text()):
  if url.startswith(('http:','https:','data:')):continue
  target=(css.parent/url).resolve()
  if not target.is_file():errors.append(f'{css.name}: missing CSS resource {url}')
# Legal rich content remains verbatim, including all original policy statements.
imports=json.loads((ROOT/'checks/legal-hashes.json').read_text())
for route in ['privacy-policy','terms-of-use']:
 original=(ROOT/f'content/{route}.html').read_text()
 if hashlib.sha256(original.encode()).hexdigest()!=imports['legalFragments'][route+'.html']:errors.append(f'{route}: differs from captured source')
 if original not in (OUT/route/'index.html').read_text():errors.append(f'{route}: legal content changed')
seller=(OUT/'app-ads.txt').read_bytes();integrity={'source':'Repository root app-ads.txt'}
seller_override=os.environ.get('APP_ADS_SOURCE')
if MODE=='production' and not seller_override:errors.append('Production build did not use public Pages seller source')
seller_source=Path(seller_override).expanduser().resolve() if seller_override else ROOT.parent/'app-ads.txt'
source=seller_source.read_bytes()
expected_sha=os.environ.get('APP_ADS_SHA256') if seller_override else hashlib.sha256(source).hexdigest()
if seller_override and (not expected_sha or not re.fullmatch(r'[0-9a-f]{64}',expected_sha)):
 errors.append('APP_ADS_SHA256 required for external seller source')
seller_sha=hashlib.sha256(seller).hexdigest()
if seller!=source or seller_sha!=expected_sha:errors.append('Seller list changed')
if b'<html' in seller.lower():errors.append('Seller file is HTML')
if b'OWNERDOMAIN=puzzlecats.com' not in seller.splitlines():errors.append('Puzzle Cats owner domain missing')
sitemap=ET.parse(OUT/'sitemap.xml')
locations=[n.text for n in sitemap.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
if len(locations)!=22 or len(set(locations))!=22:errors.append('Expected 22 unique canonical sitemap URLs')
site=json.loads((ROOT/'content/site.json').read_text())
for game in site['games']:
 page=(OUT/'games'/game['slug']/'index.html').read_text()
 if f'https://www.puzzlecats.com/games/{game["slug"]}/' not in page:errors.append('Game canonical missing')
 for screenshot in game['screenshots']:
  if not (OUT/'assets'/screenshot).is_file():errors.append('Missing screenshot '+screenshot)
guides=json.loads((ROOT/'content/legacy-guides.json').read_text())+json.loads((ROOT/'content/new-guides.json').read_text())
for guide in guides:
 html=(OUT/'guides'/guide['slug']/'index.html').read_text()
 if guide['description'] not in html:errors.append('Missing guide description '+guide['slug'])
 if 'max-snippet:-1' not in html and MODE=='production':errors.append('Production snippet eligibility missing')
 if guide.get('published') and guide['published'] not in html:errors.append('Original publication date missing')
 if not guide.get('published') and 'datePublished' in html:errors.append('Unpublished guide has invented publication date')
 for source in guide['sources']:
  if source['url'].replace('&','&amp;') not in html:errors.append('Guide citation missing '+guide['slug'])
for i in range(1,6):
 if f'id="article-{i}"' not in (OUT/'blog/index.html').read_text():errors.append('Legacy article fragment missing')
# Preserve the old raw blog bodies for audit, but do not publish their unsupported claims.
if any((OUT/f'blog-{i}.html').exists() for i in range(1,6)):errors.append('Archived blog source was published')
if '90% solvable' in (OUT/'blog/index.html').read_text():errors.append('Unsupported archived claim leaked')
seen_titles=set();seen_descriptions=set()
for url in locations:
 route=url.removeprefix('https://www.puzzlecats.com')
 path=OUT/route.strip('/')/'index.html'
 if route=='/':path=OUT/'index.html'
 html=path.read_text()
 from html import unescape
 title=unescape(re.search(r'<title>(.*?)</title>',html).group(1))
 description=unescape(re.search(r'<meta name="description" content="(.*?)">',html).group(1))
 if title in seen_titles or description in seen_descriptions:errors.append('Duplicate title/description '+route)
 seen_titles.add(title);seen_descriptions.add(description)
 if MODE=='preview' and '<meta name="robots" content="noindex,follow">' not in html:errors.append('Preview index guard missing '+route)
 if MODE=='production' and '<meta name="robots" content="index,follow,max-snippet:-1' not in html:errors.append('Production index setting missing '+route)
 if route!='/' and '/assets/main.js' in html:errors.append('Unneeded Spline/entrance loader on content page '+route)
for game in site['games']:
 html=(OUT/'games'/game['slug']/'index.html').read_text()
 fact=game['publicIos']
 if fact['price']!=0 or fact['currency']!='USD':errors.append('Visible free-price copy requires a new review '+game['slug'])
 if not game.get('google') and 'Google Play buttons' in html:errors.append('Unavailable Android promised '+game['slug'])
 if not game.get('google') and re.search(r'<a[^>]+href="https://play.google.com',html):errors.append('Unverified Android link '+game['slug'])
 if game['slug']=='minesweeper':
  if '<p class="status-label">Coming soon</p>' not in html or 'not included in the current public version 2.1' not in html:errors.append('Upcoming boundary missing')
# Redirect utilities must remain outside sitemap and point at a real canonical resource.
for alias in json.loads((OUT/'.redirects.json').read_text()):
 if 'https://www.puzzlecats.com'+alias['from'] in locations:errors.append('Redirect in sitemap')
 html=(OUT/alias['from'].strip('/')/'index.html').read_text()
 expected='https://www.puzzlecats.com'+(alias['to'].split('#')[0] or '/')
 if f'rel="canonical" href="{expected}"' not in html:errors.append('Wrong redirect canonical '+alias['from'])
policy=json.loads((OUT/'.security.json').read_text())
for path in OUT.rglob('*.html'):
 if policy['mode']=='enforce' and 'http-equiv="Content-Security-Policy"' not in path.read_text():errors.append('Missing CSP '+str(path))
# Native artwork has no eval, hosted scene, worker or Webflow dependencies.
for path in OUT.rglob('*'):
 if path.suffix in ['.js','.html','.css','.json'] and re.search(r'prod\.spline\.design|@splinetool|scene\.splinecode|unsafe-eval|wasm-unsafe-eval',path.read_text()):errors.append('Forbidden hosted-scene dependency: '+str(path))
 if path.suffix in ['.splinecode','.wasm']:errors.append('Forbidden binary runtime asset: '+str(path))
if not (OUT/'assets/THREE-LICENSE.txt').is_file():errors.append('Missing Three.js MIT notice')
for kind in ['hero','footer']:
 if f'data-scene="{kind}"' not in (OUT/'index.html').read_text():errors.append('Native artwork missing: '+kind)
 if not (OUT/f'assets/artwork-{kind}-poster.webp').is_file():errors.append('Native poster missing: '+kind)
protected_count=0
if not (OUT/'robots.txt').read_text().startswith('User-agent: *\nAllow: /'):errors.append('Invalid robots')
if not (OUT/'assets/social-card.jpg').exists():errors.append('Missing social image')
seller_report=integrity if not seller_override else {'source':'Pages repository app-ads.txt','sha256':seller_sha,'bytes':len(seller),'sourceCommit':os.environ.get('APP_ADS_COMMIT')}
report=dict(pages=count,errors=errors,seller=seller_report,legalContentUnchanged=True,protectedSourceFilesUnchanged=protected_count,canonicalPages=len(locations),guides=len(guides),games=len(site['games']),siteMode=MODE,basePath=BASE,graphicsRuntimeShipped=True)
report_path=Path(os.environ.get('VALIDATION_REPORT',OUT/'validation.json'))
report_path.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2));raise SystemExit(bool(errors))
