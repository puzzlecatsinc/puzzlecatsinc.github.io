#!/usr/bin/env python3
"""Build and validate from this repository; optionally refresh only generated paths."""
import argparse,hashlib,os,shutil,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--stage',action='store_true',help='refresh the committed Pages output')
args=parser.parse_args()
seller=REPO/'app-ads.txt';original=seller.read_bytes()
if b'OWNERDOMAIN=puzzlecats.com' not in original.splitlines() or b'<html' in original.lower():
 raise SystemExit('Invalid repository root app-ads.txt')
env=dict(os.environ,SITE_MODE='production',BUILD_DIR='dist-production',APP_ADS_SOURCE=str(seller),APP_ADS_SHA256=hashlib.sha256(original).hexdigest())
for script in ['build.py','check.py']:
 subprocess.run([sys.executable,str(ROOT/'scripts'/script)],cwd=ROOT,env=env,check=True)
out=ROOT/'dist-production'
if (out/'app-ads.txt').read_bytes()!=original:raise SystemExit('Seller changed during build')
if args.stage:
 # Explicit output allowlist: never remove or overwrite editable source or root sellers.
 paths=['assets','blog','games','guides','privacy-policy','terms-of-use','wellness','studio-family','app-ads-txt','llms-txt','index.html','404.html','llms.txt','robots.txt','sitemap.xml','.nojekyll','CNAME']
 for name in paths:
  source=out/name;destination=REPO/name
  if not source.exists():raise SystemExit('Missing generated path: '+name)
  if name=='CNAME' and destination.read_text().strip()==source.read_text().strip():continue
  if destination.is_dir():shutil.rmtree(destination)
  if source.is_dir():shutil.copytree(source,destination)
  else:shutil.copyfile(source,destination)
 if seller.read_bytes()!=original:raise SystemExit('Canonical root seller was changed')
print('Validated single-repository production build; root app-ads.txt preserved.')
