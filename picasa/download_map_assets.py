#!/usr/bin/env python3
"""
Download all CDN assets used by folium and save them locally.
Respects system proxy (HTTPS_PROXY / HTTP_PROXY env vars) or a custom proxy
passed as the first argument:

    python3 download_map_assets.py [proxy_url]
    python3 download_map_assets.py http://proxy.corp.com:8080

Once downloaded, the app uses local-asset mode by default (map_use_local_assets=true).
"""
import sys, os, re
sys.stdout.reconfigure(line_buffering=True)

import urllib.request
from pathlib import Path

# ── Resolve proxy ───────────────────────────────────────────────────────────
proxy_url = ""
if len(sys.argv) > 1:
    proxy_url = sys.argv[1]
    print(f"Using proxy from argument: {proxy_url}")
else:
    proxy_url = (os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
                 or os.environ.get("HTTP_PROXY") or os.environ.get("http_proxy") or "")
    if proxy_url:
        print(f"Using proxy from environment: {proxy_url}")
    else:
        print("No proxy configured – direct connection")

if proxy_url:
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url}))
else:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

# ── Generate a sample map to discover the CDN URLs folium uses ───────────────
import folium
from folium.plugins import HeatMap
import tempfile

m = folium.Map(location=[48.85, 2.29], zoom_start=10)
HeatMap([[48.85, 2.29]], radius=15).add_to(m)
folium.Marker([48.85, 2.29],
              icon=folium.Icon(color='green', icon='camera', prefix='fa')).add_to(m)

with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False) as f:
    m.save(f.name)
    html = open(f.name).read()

urls = re.findall(r'https?://[^\s"\'<>]+(?:\.js|\.css)', html)
urls = list(dict.fromkeys(urls))
print(f"\nFound {len(urls)} CDN assets to download:")
for u in urls:
    print(f"  {u}")

# ── Download ─────────────────────────────────────────────────────────────────
assets_dir = Path(__file__).parent / 'cache' / 'map_assets'
assets_dir.mkdir(parents=True, exist_ok=True)

ok = 0
for url in urls:
    url_path = url.split('?')[0]
    ext = '.js' if url_path.endswith('.js') else '.css'
    base = re.sub(r'[^\w._-]', '_',
                  url_path.replace('https://', '').replace('http://', ''))
    base = base.rstrip('_')[:100]
    if not base.endswith(ext):
        base += ext
    dest = assets_dir / base

    if dest.exists():
        print(f"  CACHED  {dest.name}")
        ok += 1
        continue
    try:
        print(f"  GET     {url[:75]}...", end=' ', flush=True)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with opener.open(req, timeout=20) as resp:
            data = resp.read()
        dest.write_bytes(data)
        print(f"OK ({len(data)//1024}KB)")
        ok += 1
    except Exception as e:
        print(f"FAILED: {e}")

print(f"\n✓ {ok}/{len(urls)} assets ready in {assets_dir}")
print("\nTo use CDN mode instead, set in your config.json:")
print('  "map_use_local_assets": false')
print('  "map_proxy": "http://your-proxy:8080"   ← optional')


import urllib.request
from pathlib import Path

# Generate a sample folium map to get the exact CDN URLs it uses
import folium
from folium.plugins import HeatMap

m = folium.Map(location=[48.85, 2.29], zoom_start=10)
HeatMap([[48.85, 2.29]], radius=15).add_to(m)
folium.Marker([48.85, 2.29], icon=folium.Icon(color='green', icon='camera', prefix='fa')).add_to(m)

import tempfile
with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False) as f:
    m.save(f.name)
    html = open(f.name).read()

# Find all CDN URLs (scripts and stylesheets)
urls = re.findall(r'https?://[^\s"\'<>]+(?:\.js|\.css)', html)
urls = list(dict.fromkeys(urls))  # deduplicate preserving order
print(f"Found {len(urls)} CDN assets:")
for u in urls:
    print(f"  {u}")

# Download each to cache/map_assets/
assets_dir = Path(__file__).parent / 'cache' / 'map_assets'
assets_dir.mkdir(parents=True, exist_ok=True)

downloaded = {}
import re
for url in urls:
    url_path = url.split('?')[0]
    ext = '.js' if url_path.endswith('.js') else '.css'
    base = re.sub(r'[^\w._-]', '_', url_path.replace('https://', '').replace('http://', ''))
    base = base.rstrip('_')[:100]
    if not base.endswith(ext):
        base = base + ext
    dest = assets_dir / base
    if dest.exists():
        print(f"  CACHED: {dest.name}")
        downloaded[url] = dest
        continue
    try:
        print(f"  Downloading: {url[:70]}...", end=' ', flush=True)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read()
        dest.write_bytes(content)
        print(f"OK ({len(content)} bytes)")
        downloaded[url] = dest
    except Exception as e:
        print(f"FAILED: {e}")

print(f"\nDownloaded {len(downloaded)}/{len(urls)} assets to {assets_dir}")

