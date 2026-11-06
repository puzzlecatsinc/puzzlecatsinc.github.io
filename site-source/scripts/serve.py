#!/usr/bin/env python3
"""Loopback-only preview; mimic static directory redirects and security policies."""
import argparse
import functools
import json
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, unquote

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8780)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1] / 'dist-production'

class Handler(SimpleHTTPRequestHandler):
    def redirect_alias(self):
        # Local HTTP emulation only. GitHub Pages itself cannot consume this manifest.
        parts = urlsplit(self.path)
        config = json.loads((root / '.build.json').read_text())
        base = config['basePath']
        manifest = json.loads((root / '.redirects.json').read_text())
        for item in manifest:
            if parts.path in [base + item['from'], base + item['from'].rstrip('/')]:
                target = urlsplit(base + item['to'])
                location = urlunsplit(('', '', target.path, parts.query, target.fragment))
                self.send_response(301)
                self.send_header('Location', location)
                self.send_header('Content-Length', '0')
                self.end_headers()
                return True
        return False

    def do_GET(self):
        if not self.redirect_alias():
            super().do_GET()

    def do_HEAD(self):
        if not self.redirect_alias():
            super().do_HEAD()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        config = root / '.build.json'
        if config.exists() and json.loads(config.read_text()).get('siteMode') == 'preview':
            self.send_header('X-Robots-Tag', 'noindex, follow')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        config = root / '.security.json'
        if config.exists():
            policy = json.loads(config.read_text())
            header = 'Content-Security-Policy' if policy['mode'] == 'enforce' else 'Content-Security-Policy-Report-Only'
            is_home = urlsplit(self.path).path in ['/', '/index.html']
            csp = policy['sceneCsp'] if is_home else policy['csp']
            self.send_header(header, csp + "; frame-ancestors 'none'")
        super().end_headers()

    def send_error(self, code, message=None, explain=None):
        if code == 404 and (root / '404.html').is_file():
            data = (root / '404.html').read_bytes()
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().send_error(code, message, explain)

print(f'Preview: http://127.0.0.1:{args.port}/', flush=True)
ThreadingHTTPServer(('127.0.0.1', args.port), functools.partial(Handler, directory=str(root))).serve_forever()
