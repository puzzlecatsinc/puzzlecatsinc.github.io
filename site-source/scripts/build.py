#!/usr/bin/env python3
"""Produce portable static pages; the same artifact works on a root or project path."""
import hashlib
import json
import os
import re
import shutil
import subprocess
from datetime import date
from html import escape
from pathlib import Path
from urllib.parse import urlsplit
from xml.sax.saxutils import escape as xml_escape

ROOT = Path(__file__).resolve().parents[1]
BUILD_DIR = os.environ.get('BUILD_DIR', 'dist')
if BUILD_DIR not in ['dist', 'dist-production', 'dist-subpath']:
    raise SystemExit('BUILD_DIR must be dist, dist-production or dist-subpath')
OUT = ROOT / BUILD_DIR
SITE_MODE = os.environ.get('SITE_MODE', 'preview')
if SITE_MODE not in ['preview', 'production']:
    raise SystemExit('SITE_MODE must be preview or production')
if SITE_MODE == 'production' and (not os.environ.get('APP_ADS_SOURCE') or not os.environ.get('APP_ADS_SHA256')):
    raise SystemExit('Production builds require the public Pages seller source and pinned hash; use scripts/prepare_pages_release.py')
BASE = os.environ.get('BASE_PATH', '').rstrip('/')
CSP_MODE = os.environ.get('CSP_MODE', 'enforce')
if BASE and (not BASE.startswith('/') or '..' in BASE or not re.fullmatch(r'/[a-zA-Z0-9/_-]+', BASE)):
    raise SystemExit('BASE_PATH must be a safe path, for example /web')
if CSP_MODE not in ['report-only', 'enforce']:
    raise SystemExit('CSP_MODE must be report-only or enforce')
site = json.loads((ROOT / 'content/site.json').read_text())
analytics = json.loads((ROOT / 'content/analytics.json').read_text())
canonical = site['canonical']
assert canonical == 'https://www.puzzlecats.com'
assert re.fullmatch(r'G-[A-Z0-9]+', analytics['measurementId'])
verified_browser = {
    'block-puzzle': 'https://blockpuzzlegamesinc.com/blockpuzzle/',
    'sudoku': 'https://fishsudoku.com/',
}
for game in site['games']:
    assert re.fullmatch(r'[a-z0-9-]+', game['slug'])
    if game.get('browser'):
        assert game['browser'] == verified_browser[game['slug']]
    for key, host in [('apple', 'apps.apple.com'), ('google', 'play.google.com')]:
        if not game.get(key):
            continue
        url = urlsplit(game[key])
        assert url.scheme == 'https' and url.hostname == host
if OUT.exists():
    shutil.rmtree(OUT)
(OUT / 'assets').mkdir(parents=True)
used_suffixes = ('pc-icon.svg', 'pc-wordmark.svg', 'mail-icon.svg', 'btn-dl-apple.svg',
                 'btn-dl-android.svg', 'rifton-regular.otf', '2.png')
for asset in (ROOT / 'public/assets').iterdir():
    if (asset.name.endswith(used_suffixes) or asset.name.startswith(('game-', 'schibsted-', 'artwork-'))
            or re.fullmatch(r'\d+-screen-\d\.webp', asset.name)
            or asset.name in ['fonts.css', 'team.webp', 'social-card.jpg', 'Schibsted-Grotesk-OFL.txt']):
        shutil.copyfile(asset, OUT / 'assets' / asset.name)
shutil.copyfile(ROOT / 'node_modules/three/LICENSE', OUT / 'assets/THREE-LICENSE.txt')
seller_source = Path(os.environ.get('APP_ADS_SOURCE', ROOT.parent / 'app-ads.txt')).expanduser().resolve()
if not seller_source.is_file():
    raise SystemExit(f'APP_ADS_SOURCE is not a file: {seller_source}')
shutil.copyfile(seller_source, OUT / 'app-ads.txt')
shutil.copyfile(ROOT / 'src/style.css', OUT / 'assets/style.css')
subprocess.run([
    str(ROOT / 'node_modules/.bin/esbuild'), 'src/main.js', 'src/native-artwork.js', 'src/analytics.js',
    '--bundle', '--splitting', '--format=esm', '--minify', f'--outdir={BUILD_DIR}/assets',
    '--chunk-names=chunks/[name]-[hash]', '--loader:.svg=text', '--log-level=warning',
    '--define:__ANALYTICS_CONFIG__=' + json.dumps(analytics, separators=(',', ':')),
], cwd=ROOT, check=True)

# No arbitrary script origins, inline scripts, injected HTML, forms or embeds.
# All pages disallow JS eval and workers. Procedural artwork needs no remote hosts.
# Analytics keeps exactly the original property.
CSP = "; ".join([
    "default-src 'self'", "base-uri 'none'", "object-src 'none'",
    "script-src 'self' https://www.googletagmanager.com",
    "style-src 'self'", "font-src 'self' data:",
    "img-src 'self' data: blob: https://*.google-analytics.com https://www.googletagmanager.com",
    "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
    "worker-src 'none'", "media-src 'self'",
    "frame-src 'none'", "form-action 'none'",
])
SCENE_CSP = CSP
(OUT / '.security.json').write_text(json.dumps({'mode': CSP_MODE, 'csp': CSP, 'sceneCsp': SCENE_CSP}, indent=2))


def img(suffix):
    return BASE + '/assets/' + next(p.name for p in (OUT / 'assets').iterdir() if p.name.endswith(suffix))


def header():
    nav = [('Games', '/#Anchor-Games'), ('About', '/#Anchor-About'), ('AI', '/#Anchor-AI'),
           ('Research', '/#Anchor-Wellness'), ('Blog', '/blog/'), ('Careers', site['careers'])]
    links = ''.join(f'<a href="{escape(BASE + url if url.startswith("/") else url)}">{label}</a>' for label, url in nav)
    return f'''<a class="skip" href="#main">Skip to content</a><header class="site-header"><a class="brand" href="{BASE}/" aria-label="Puzzle Cats home"><img class="brand-icon" src="{img('pc-icon.svg')}" alt="" width="37" height="37"><img class="brand-wordmark" src="{img('pc-wordmark.svg')}" alt="Puzzle Cats" width="174" height="30"></a><nav aria-label="Main navigation">{links}</nav><a class="button purple" href="{escape(site['contact'])}"><img src="{img('mail-icon.svg')}" alt="" width="21" height="18">Contact</a></header>'''


def footer(scene=True):
    artwork = ''
    if scene:
        artwork = f'''<div class="scene footer-scene" data-scene="footer"><div class="footer-label" aria-hidden="true">We are<br>Puzzle<br>Cats</div><img class="poster" src="{BASE}/assets/artwork-footer-poster.webp" alt="A gold coin with the Puzzle Cats crown" width="1100" height="600" loading="lazy"><canvas aria-hidden="true"></canvas><button class="scene-control" type="button">Explore 3D</button><span class="scene-status sr-only" role="status"></span></div>'''
    return f'''<footer class="site-footer">{artwork}<div class="footer-bottom"><div><p>©2026 Puzzle Cats Inc.</p><p>A Canadian game studio creating playful moments and exploring the possibilities of play.</p></div><nav class="footer-links" aria-label="Legal and company"><a href="{BASE}/games/">All games</a><a href="{BASE}/privacy-policy/">Privacy policy</a><a href="{BASE}/terms-of-use/">Terms of use</a><a href="{BASE}/app-ads.txt">App-ads.txt</a><a href="{BASE}/blog/">Blog</a></nav><span>Made in Canada <span aria-hidden="true">✦</span></span></div></footer>'''


def document(title, description, path, body, scene=True, noindex=False, schema=None, redirect=None):
    url = canonical + path
    canonical_url = canonical + (redirect.split('#')[0] or '/') if redirect else url
    noindex = noindex or SITE_MODE == 'preview'
    structured = schema or {'@context': 'https://schema.org', '@type': 'WebPage', 'name': title,
                            'url': url, 'isPartOf': {'@type': 'WebSite', 'name': 'Puzzle Cats', 'url': canonical + '/'}}
    data = json.dumps(structured, ensure_ascii=False).replace('<', '\\u003c')
    policy = f'<meta http-equiv="Content-Security-Policy" content="{escape(SCENE_CSP if scene else CSP)}">' if CSP_MODE == 'enforce' else ''
    motion_script = f'<script type="module" src="{BASE}/assets/main.js"></script>' if scene else ''
    refresh = f'<meta http-equiv="refresh" content="0;url={escape(BASE + redirect)}">' if redirect else ''
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8">{policy}<meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)}</title><meta name="description" content="{escape(description)}"><link rel="canonical" href="{escape(canonical_url)}"><meta name="robots" content="{'noindex,follow' if noindex else 'index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1'}"><meta name="referrer" content="strict-origin-when-cross-origin"><meta name="theme-color" content="#141117"><link rel="icon" href="{img('2.png')}"><link rel="stylesheet" href="{BASE}/assets/style.css"><link rel="help" type="text/plain" href="{BASE}/llms.txt" title="LLM information"><meta property="og:type" content="website"><meta property="og:title" content="{escape(title)}"><meta property="og:description" content="{escape(description)}"><meta property="og:url" content="{escape(url)}"><meta property="og:image" content="{canonical}/assets/social-card.jpg"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{escape(title)}"><meta name="twitter:description" content="{escape(description)}"><meta name="twitter:image" content="{canonical}/assets/social-card.jpg"><script type="application/ld+json">{data}</script>{motion_script}<script type="module" src="{BASE}/assets/analytics.js"></script>{refresh}</head><body>{header()}{body}{footer(scene)}</body></html>'''


routes = []


def write_page(path, title, description, body, **kwargs):
    target = OUT / path.lstrip('/')
    if path == '/':
        target = OUT
    target.mkdir(parents=True, exist_ok=True)
    (target / 'index.html').write_text(document(title, description, path, body, **kwargs))
    if not kwargs.get('noindex'):
        routes.append(path)


def stores(game):
    browser = (f'<a class="browser-download" href="{escape(game["browser"])}" aria-label="Play {escape(game["name"])} in your browser">Play in browser <span aria-hidden="true">↗</span></a>' if game.get('browser') else '')
    return '<div class="store-links">' + ''.join(
        f'<a href="{escape(game[key])}" aria-label="{escape(game["name"])} on {label}"><img src="{img(suffix)}" alt="" width="126" height="42"></a>'
        for key, label, suffix in [('apple', 'the App Store', 'btn-dl-apple.svg'), ('google', 'Google Play', 'btn-dl-android.svg')] if game.get(key)) + browser + '</div>'


def cards(heading='h3'):
    return ''.join(f'''<article class="game-card"><img src="{BASE}/assets/{game['image']}" alt="{escape(game['name'])} game artwork" width="{game["imageSize"][0]}" height="{game["imageSize"][1]}" loading="lazy"><div class="game-info"><{heading}>{escape(game['name'])}</{heading}><p>{escape(game['copy'])}</p>{stores(game)}<a class="game-details" href="{BASE}/games/{game['slug']}/" aria-label="Explore {escape(game['name'])}">Explore the game <span aria-hidden="true">↗</span></a></div></article>''' for game in site['games'])


def render(template, values):
    for key, value in values.items():
        template = template.replace('{{' + key + '}}', str(value))
    if '{{' in template:
        raise ValueError('Unresolved template marker')
    return template


# Product and guide facts are rendered as ordinary HTML; JavaScript is optional.
details = json.loads((ROOT / 'content/game-details.json').read_text())
guides = json.loads((ROOT / 'content/new-guides.json').read_text()) + json.loads((ROOT / 'content/legacy-guides.json').read_text())
guide_map = {g['slug']: g for g in guides}
for guide in guides:
    assert re.fullmatch(r'[a-z0-9-]+', guide['slug'])
    date.fromisoformat(guide['updated'])
    for source in guide['sources']:
        assert urlsplit(source['url']).scheme == 'https'

def paragraphs(values):
    return ''.join('<p>' + escape(value) + '</p>' for value in values)

def source_list(sources):
    return '<ul class="source-list">' + ''.join(f'<li><a href="{escape(source["url"])}">{escape(source["title"])}</a></li>' for source in sources) + '</ul>'

def guide_links(slugs):
    return '<ul class="reading-links">' + ''.join(f'<li><a href="{BASE}/guides/{slug}/">{escape(guide_map[slug]["title"])}</a></li>' for slug in slugs) + '</ul>'

def breadcrumb(parts):
    return {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': name, 'item': canonical + path}
        for i, (name, path) in enumerate(parts)]}

organization = {'@type': 'Organization', '@id': canonical + '/#organization', 'name': 'Puzzle Cats Inc.',
                'url': canonical + '/', 'logo': canonical + img('pc-icon.svg').removeprefix(BASE),
                'foundingDate': '2017', 'contactPoint': {'@type': 'ContactPoint', 'email': 'contact@puzzlecats.com', 'contactType': 'General inquiry'}}
items = {'@type': 'ItemList', 'name': 'Puzzle Cats game catalogue', 'itemListElement': [
    {'@type': 'ListItem', 'position': i + 1, 'item': {'@type': 'VideoGame', 'name': game['officialName'],
     'url': canonical + '/games/' + game['slug'] + '/', 'gamePlatform': ['iOS'] + (['Android'] if game.get('google') else []),
     'sameAs': [game[k] for k in ['apple','google'] if game.get(k)]}} for i, game in enumerate(site['games'])]}
values = {key: escape(value) for key, value in site.items() if isinstance(value, str)}
values.update(base=BASE, game_cards=cards())
write_page('/', site['title'], site['description'], render((ROOT / 'src/home.html').read_text(), values),
           schema={'@context': 'https://schema.org', '@graph': [organization, {'@type': 'WebSite', 'name': 'Puzzle Cats', 'url': canonical + '/'}, items]})
write_page('/games/', 'Minesweeper, Solitaire, Word & Puzzle Games | Puzzle Cats',
           'Find your next favourite: play Minesweeper, Spider Solitaire, TriPeaks, word puzzles, Sudoku, block puzzles and driving games. Download for your device.',
           '<main class="panel lime catalogue-page" id="main"><p class="eyebrow">Find your next favourite</p><h1>So many ways<br>to play.</h1><p class="intro">Classic cards. Clever puzzles. Open roads. Explore our nine featured games, find the challenge you enjoy and download it for your device.</p><p class="catalogue-guide"><a href="' + BASE + '/blog/">Need a hand choosing? Read the game guides →</a></p><div class="game-grid">' + cards('h2') + '</div></main>',
           scene=False, schema={'@context': 'https://schema.org', '@graph': [organization, items]})
for game in site['games']:
    path = '/games/' + game['slug'] + '/'
    info = details[game['slug']]
    release = game['publicIos']
    steps = ''.join('<li>' + escape(step) + '</li>' for step in game['steps'])
    screenshots = ''.join(f'<figure><img src="{BASE}/assets/{name}" alt="{escape(game["name"])} official App Store screenshot {i + 1}" width="{game["screenSizes"][name][0]}" height="{game["screenSizes"][name][1]}" loading="lazy"><figcaption>App Store screenshot {i + 1}</figcaption></figure>' for i, name in enumerate(game['screenshots']))
    rows = ''.join(f'<tr><th scope="row">{escape(row["feature"])}</th><td>{escape(row["evidence"])}</td><td>{escape(row["platform"])}</td></tr>' for row in info['featureRows'])
    features = f'<div class="table-scroll" tabindex="0" role="region" aria-label="{escape(game["name"])} feature availability"><table><caption>Find your way to play</caption><thead><tr><th scope="col">Feature</th><th scope="col">Details</th><th scope="col">Platform / availability</th></tr></thead><tbody>{rows}</tbody></table></div>'
    sections = ''.join(f'<section class="game-section editorial-copy"><h2>{escape(section["title"])}</h2>{paragraphs(section["paragraphs"])}</section>' for section in info['sections'])
    faqs = ''.join(f'<details><summary>{escape(faq["question"])}</summary><p>{escape(faq["answer"])}</p></details>' for faq in info['faqs'])
    upcoming = ''
    if info.get('comingSoon'):
        upcoming = '<section class="game-section upcoming" aria-labelledby="upcoming-title"><p class="status-label">Coming soon</p><h2 id="upcoming-title">More ways to understand your game.</h2>' + paragraphs([info['comingSoon']['intro']]) + '<ul>' + ''.join('<li>'+escape(item)+'</li>' for item in info['comingSoon']['features']) + '</ul>' + paragraphs([info['comingSoon']['availability']]) + '</section>'
    platform = 'iPhone / iPad' + (' · Android' if game.get('google') else '')
    related = guide_links(info['guideSlugs']) if info['guideSlugs'] else f'<p><a href="{BASE}/games/">Browse other games and their rules →</a></p>'
    body = f'''<main class="wrap game-page" id="main"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="{BASE}/games/">All games</a> / {escape(game['name'])}</nav><section class="game-heading" aria-labelledby="game-title"><div><p class="game-kicker">{escape(game['category'])}</p><h1 id="game-title">{escape(game['name'])}</h1><p>{escape(info['description'])}</p>{stores(game)}<p class="fine">Download for your device. See your store for compatibility and purchase options.</p><a class="back-to-games" href="#features">Find your way to play ↓</a></div><img class="game-cover" src="{BASE}/assets/{game['image']}" alt="{escape(game['name'])} game artwork" width="{game["imageSize"][0]}" height="{game["imageSize"][1]}" fetchpriority="high"></section><section class="game-section editorial-copy"><h2>Find your next challenge.</h2>{paragraphs(info['overview'])}</section><section class="game-section" id="features"><h2>Features for your device.</h2>{features}</section>{upcoming}<section class="game-section" aria-labelledby="play-title"><h2 id="play-title">Make your next move.</h2><ol class="game-steps">{steps}</ol></section>{sections}<section class="game-section" id="screenshots" aria-labelledby="screenshots-title"><h2 id="screenshots-title">See it in play.</h2><p class="fine">Take a closer look at the iPhone and iPad game. Appearance may vary by device and version.</p><div class="screenshots">{screenshots}</div></section><section class="game-section" aria-labelledby="before-title"><h2 id="before-title">Before you play.</h2>{faqs}<details><summary>Where can I find privacy information or help?</summary><p>Read the <a href="{BASE}/privacy-policy/">Puzzle Cats privacy policy</a> and app-specific store disclosures. For help, email <a href="mailto:contact@puzzlecats.com">contact@puzzlecats.com</a>.</p></details></section><section class="game-section"><h2>Read before your next round.</h2>{related}</section><section class="game-section sources"><h2>App details and support.</h2><dl class="game-facts"><div><dt>Published by</dt><dd>{escape(game['publisher'])}</dd></div><div><dt>Available on</dt><dd>{platform}</dd></div><div><dt>iOS version</dt><dd>Version {escape(release['version'])} · {release['released']}</dd></div></dl><p class="release-note">Free to download on the US App Store. Optional purchases and regional offers vary; see your store for current terms.</p>{source_list(info['sources'])}</section><section class="game-section game-download"><p class="eyebrow">Your next round starts here</p><h2>Play {escape(game['name'])}.</h2>{stores(game)}<a class="back-to-games" href="{BASE}/games/">← Browse all games</a></section></main>'''
    application = {'@type': 'MobileApplication', 'name': game['officialName'],
              'url': canonical + path, 'description': info['description'], 'applicationCategory': 'GameApplication',
              'operatingSystem': 'iOS' + (', Android' if game.get('google') else ''),
              'publisher': {'@type': 'Organization', 'name': game['publisher']},
              'offers': {'@type':'Offer','price':release['price'],'priceCurrency':release['currency'], 'url':release['source'], 'eligibleRegion': {'@type':'Country','name':'United States'}},
              'screenshot': [canonical + '/assets/' + s for s in game['screenshots']],
              'sameAs': [game[k] for k in ['apple','google'] if game.get(k)]}
    schema = {'@context':'https://schema.org','@graph':[application,breadcrumb([('Home','/'),('Games','/games/'),(game['name'],path)])]}
    write_page(path, info['metaTitle'], info['description'], body, scene=False, schema=schema)

for route, title in [('privacy-policy', 'Privacy Policy'), ('terms-of-use', 'Terms of Use')]:
    legal = (ROOT / f'content/{route}.html').read_text()
    write_page('/' + route + '/', title + ' | Puzzle Cats', title + ' for Puzzle Cats games.',
               f'<main class="legal-main" id="main"><h1>{title}</h1><div class="legal-text">{legal}</div></main>', scene=False)

guide_cards = []
for guide in guides:
    path = '/guides/' + guide['slug'] + '/'
    html = (ROOT / 'content' / guide['bodyFile']).read_text().replace('{{base}}', BASE)
    assert '<h1' not in html and '{{' not in html
    if guide.get('published'):
        dates = f'Originally published <time datetime="{guide["published"]}">{guide["published"]}</time> · '
    else:
        dates = 'New guide · '
    dates += f'Updated <time datetime="{guide["updated"]}">{guide["updated"]}</time>'
    heads = re.findall(r'<h2 id="([a-z0-9-]+)">(.*?)</h2>',html)
    toc = '<nav class="guide-toc" aria-label="In this guide"><strong>In this guide</strong><ul>' + ''.join(f'<li><a href="#{anchor}">{title}</a></li>' for anchor,title in heads) + '</ul></nav>'
    download_cta = '<aside class="guide-download" aria-label="Related app downloads"><p class="eyebrow">Try these tips in your next game</p>' + ''.join('<div><strong>' + escape(next(g['name'] for g in site['games'] if g['slug'] == slug)) + '</strong>' + stores(next(g for g in site['games'] if g['slug'] == slug)) + '<a href="' + BASE + '/games/' + slug + '/">Explore the game →</a></div>' for slug in guide['relatedGames']) + '<p class="fine">Download for your device. Purchase options vary by platform and region.</p></aside>'
    game_links = '<ul class="reading-links">' + ''.join(f'<li><a href="{BASE}/games/{slug}/">{escape(next(g["name"] for g in site["games"] if g["slug"] == slug))}</a></li>' for slug in guide['relatedGames']) + '</ul>'
    body = f'<main class="guide-page" id="main"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="{BASE}/blog/">Game guides</a> / {escape(guide["title"])}</nav><article><header><p class="game-kicker">From the Puzzle Cats studio</p><h1>{escape(guide["title"])}</h1><p class="guide-deck">{escape(guide["description"])}</p><p class="guide-meta">By Puzzle Cats · {dates}</p></header>{download_cta}{toc}<div class="guide-body">{html}</div><section class="guide-sources"><h2>Sources and further reading</h2>{source_list(guide["sources"])}</section><section class="guide-sources"><h2>Ready for your next game?</h2>{download_cta}{game_links}<p><a href="{BASE}/blog/">← All game guides</a></p></section></article></main>'
    article = {'@type':'Article','headline':guide['title'],'description':guide['description'],'url':canonical+path,'mainEntityOfPage':canonical+path,'author':organization,'publisher':organization,'dateModified':guide['updated'],'inLanguage':'en','citation':[s['url'] for s in guide['sources']]}
    if guide.get('published'): article['datePublished']=guide['published']
    else: article['dateCreated']=guide['created']
    write_page(path,guide['metaTitle'],guide['description'],body,scene=False,schema={'@context':'https://schema.org','@graph':[article,breadcrumb([('Home','/'),('Game guides','/blog/'),(guide['title'],path)])]})
    anchor = f' id="article-{guide["legacyArticleId"]}"' if guide.get('legacyArticleId') else ''
    guide_cards.append(f'<article class="guide-card"{anchor}><p class="game-kicker">{dates}</p><h2><a href="{BASE}{path}">{escape(guide["title"])}</a></h2><p>{escape(guide["description"])}</p><a class="read-guide" href="{BASE}{path}">Read the guide <span aria-hidden="true">↗</span></a></article>')
write_page('/blog/', 'Game Guides: Minesweeper, Solitaire & Puzzles | Puzzle Cats',
           'Understand Minesweeper 3BV, compare solitaire styles and find practical strategies for TriPeaks, Hearts, word, block and merge games.',
           '<main class="wrap guide-index" id="main"><p class="eyebrow">Make your next move count</p><h1>Know the game.<br>Find your flow.</h1><p class="guide-deck">Rules, strategies and the details that matter when choosing a game. Practical examples to help you enjoy your next round.</p><p class="guide-disclosure">Explore card, word and puzzle guides from the Puzzle Cats studio, then put a new idea into practice in a game you enjoy.</p><div class="guide-grid">' + ''.join(guide_cards) + '</div></main>',scene=False)

redirects = [
 {'from':'/wellness/','to':'/#Anchor-Wellness','reason':'Existing empty wellness page becomes the reviewed research section.'},
 {'from':'/llms-txt/','to':'/llms.txt','reason':'Replace the live redirect loop with the real text resource.'},
 {'from':'/app-ads-txt/','to':'/app-ads.txt','reason':'Legacy HTML wrapper leads to the byte-exact plain-text sellers file.'},
 {'from':'/guides/','to':'/blog/','reason':'One guide hub, avoiding duplicate index pages.'},
]
for item in redirects:
    destination = item['to']
    write_page(item['from'], 'Continue to Puzzle Cats', 'Continue to the current Puzzle Cats resource.',
               f'<main class="legal-main redirect-main" id="main"><h1>Continue to Puzzle Cats.</h1><p><a href="{BASE + destination}">Open the current resource →</a></p></main>',scene=False,noindex=True,redirect=destination)
(OUT / '.redirects.json').write_text(json.dumps(redirects,indent=2)+'\n')
(OUT / '404.html').write_text(document('Page not found | Puzzle Cats', 'Find games, news and contact information from Puzzle Cats.', '/404',
    f'<main class="legal-main" id="main"><h1>A piece is missing.</h1><p>This page could not be found. <a href="{BASE}/games/">Find your next game</a>.</p></main>', scene=False, noindex=True))
(OUT / '.nojekyll').touch()
(OUT / '.build.json').write_text(json.dumps({'basePath': BASE, 'cspMode': CSP_MODE, 'siteMode':SITE_MODE}))
if SITE_MODE == 'production' and not BASE:
    (OUT / 'CNAME').write_text(urlsplit(canonical).hostname + '\n')
# Existing wildcard crawler access is preserved. Preview meta noindex is deliberate.
(OUT / 'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {canonical}/sitemap.xml\n')
modified = {path:date(2026,11,2 if path == '/' else 3).isoformat() for path in routes if path not in ['/privacy-policy/','/terms-of-use/']}
(OUT / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + ''.join(f'<url><loc>{xml_escape(canonical + route)}</loc>' + (f'<lastmod>{modified[route]}</lastmod>' if route in modified else '') + '</url>' for route in routes) + '</urlset>\n')
(OUT / 'llms.txt').write_text('# Puzzle Cats\n\n> Canadian game studio and related-publisher game catalogue.\n\n## Official pages\n' + ''.join(f'- [{route}]({canonical + route})\n' for route in routes) + '\nFeature availability is stated on each game page. Coming-soon features are not in the public release. Research goals do not establish clinical efficacy or institutional endorsement. This file is informational and is not a ranking or crawler-access mechanism.\n')
print(f'Built {len(routes)} canonical pages; base={BASE or "/"}; CSP={CSP_MODE}; mode={SITE_MODE}; output={BUILD_DIR}')

# Shared family chrome is injected outside all frozen legal/content fragments.
import runpy as _family_runpy
_family_runpy.run_path(str(ROOT / "scripts/studio_family/apply.py"))["apply"](OUT, 'puzzlecats', BASE, exclude=[])
