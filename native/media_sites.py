"""Shared site allowlist/route policy, installed beside the Native Messaging host.
Routing is based on qiaomu-clipper's site catalogue, not its ASR or UI pipeline.
"""
import json
from pathlib import Path
import re
from urllib.parse import urlparse, parse_qs

HERE = Path(__file__).resolve().parent
POLICY_PATH = HERE / 'media-platforms.json'
if not POLICY_PATH.is_file():
    POLICY_PATH = HERE.parent / 'config' / 'media-platforms.json'
PLATFORMS = json.loads(POLICY_PATH.read_text(encoding='utf-8'))
CATALOG = [entry for entry in PLATFORMS if entry.get('mode') == 'browser']

def host_in(host, hosts):
    return any(host == item or host.endswith('.' + item) for item in hosts)

def site_of(address):
    try:
        host = (urlparse(address).hostname or '').lower()
        return next((site for site in CATALOG if host_in(host, site['hosts'])), None)
    except (TypeError, ValueError):
        return None

def is_item(address):
    site = site_of(address)
    if not site:
        return False
    parsed = urlparse(address)
    host, path = (parsed.hostname or '').lower(), parsed.path
    route = path + ('?' + parsed.query if parsed.query else '') + ('#' + parsed.fragment if parsed.fragment else '')
    if site['id'] == 'facebook' and host != 'fb.watch' and not re.search(r'/videos/|/reel/|^/watch/?\?', route): return False
    if site['id'] == 'reddit' and host != 'v.redd.it' and '/comments/' not in path: return False
    if site['id'] == 'twitch' and host != 'clips.twitch.tv' and not re.search(r'^/videos/\d+|^/[^/]+/clip/', path): return False
    if site['id'] == 'dailymotion' and host != 'dai.ly' and not re.search(r'^/(embed/)?video/', path): return False
    if site['id'] == 'niconico' and host != 'nico.ms' and not path.startswith('/watch/'): return False
    if site['id'] == 'soundcloud' and re.match(r'^/(discover|search|you|stream|charts|stations)(/|$)', path): return False
    if site['id'] == 'channels':
        q = parse_qs(parsed.query)
        if host == 'weixin.qq.com': return bool(re.fullmatch(r'/sph/[A-Za-z0-9]{3,64}/?', path)) and not q
        if host != 'channels.weixin.qq.com': return False
        if path == '/finder-preview/pages/sph': return bool(re.fullmatch(r'[A-Za-z0-9]{3,64}', q.get('id', [''])[0]))
        return path == '/finder-preview/pages/feed' and bool(q.get('eid') and q.get('token'))
    if site['id'] == 'xiaoe':
        # The extension normalizes wrappers/short links before reaching the host.
        q = parse_qs(parsed.query)
        app = host.split('.')[0]
        return (bool(re.fullmatch(r'app[0-9a-z]{6,24}', app, re.I)) and
                bool(re.fullmatch(r'/(v\d+|p)/course/alive/l_[0-9a-z_]{8,64}/?', path, re.I)) and
                q.get('app_id', [''])[0].lower() == app.lower())
    return any(re.search(pattern, route) for pattern in site['routes'])

def browser_import_allowed(address):
    site = site_of(address)
    host = (urlparse(address).hostname or '').lower()
    if host == 'pornhub.com' or host.endswith('.pornhub.com'): return True
    return bool(site and is_item(address))
