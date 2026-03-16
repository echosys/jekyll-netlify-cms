"""
Geocoder - Reverse geocode GPS coordinates to city/state/country.

* Uses Nominatim (OpenStreetMap) – no API key required.
* Results are cached on disk (JSON) so each unique lat/lon is only
  fetched once across app restarts.
* Picks up system proxy settings (HTTPS_PROXY / HTTP_PROXY env vars)
  or a manually-set proxy URL from the app config.
* Thread-safe: the in-memory LRU is protected by a Lock.
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Dict, Optional, Tuple

# ---------------------------------------------------------------------------
# Optional requests import – degrade gracefully if not installed
# ---------------------------------------------------------------------------
try:
    import requests as _requests
    _REQUESTS_OK = True
except ImportError:
    _requests = None  # type: ignore[assignment]
    _REQUESTS_OK = False


# Precision used when rounding coords for the cache key (≈ 100 m)
_COORD_PRECISION = 3

_EMPTY_LOCATION: Dict[str, str] = {
    "city": "", "county": "", "state": "", "country": "", "display": ""
}


def _round_key(lat: float, lon: float) -> Tuple[float, float]:
    return round(lat, _COORD_PRECISION), round(lon, _COORD_PRECISION)


class GeocoderCache:
    """
    Persistent reverse-geocode cache backed by a JSON file.

    Usage::

        cache = GeocoderCache(Path("cache/hostname/geocode_cache.json"))
        loc = cache.lookup(33.45, -112.07, proxy_url="")
        # loc == {"city": "Phoenix", "state": "Arizona", ...}
    """

    _NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
    _USER_AGENT    = "picasa-photo-manager/1.0"
    _RATE_LIMIT_S  = 1.1   # Nominatim ToS: max 1 req/s

    def __init__(self, cache_path: Path):
        self._path  = cache_path
        self._lock  = threading.Lock()
        self._store: Dict[str, Dict[str, str]] = {}
        self._last_request_time: float = 0.0
        self._load()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def lookup(self, lat: float, lon: float,
               proxy_url: str = "") -> Dict[str, str]:
        """
        Return location dict for (lat, lon).
        Hits disk cache first, then network if not cached or cache is empty.
        Returns empty-string values if geocoding fails.
        """
        key = self._make_key(lat, lon)

        with self._lock:
            cached = self._store.get(key)
            # Only trust cache entries that have at least a country
            if cached and (cached.get("city") or cached.get("state") or cached.get("country")):
                return cached

        result = self._fetch(lat, lon, proxy_url)

        # Only persist if we got something useful (don't cache failed lookups)
        if result.get("city") or result.get("state") or result.get("country"):
            with self._lock:
                self._store[key] = result
                self._flush()
        else:
            print(f"[GeocoderCache] not caching empty result for ({lat:.4f},{lon:.4f})")

        return result

    def has(self, lat: float, lon: float) -> bool:
        """Return True only if we have a non-empty cached result."""
        key = self._make_key(lat, lon)
        with self._lock:
            cached = self._store.get(key)
            return bool(cached and (cached.get("city") or cached.get("state") or cached.get("country")))

    def get_cached(self, lat: float, lon: float) -> Optional[Dict[str, str]]:
        key = self._make_key(lat, lon)
        with self._lock:
            cached = self._store.get(key)
            # Return None for empty entries so caller knows to re-fetch
            if cached and (cached.get("city") or cached.get("state") or cached.get("country")):
                return cached
            return None

    def purge_empty(self):
        """Remove all cached entries that have no useful location data."""
        with self._lock:
            empty_keys = [k for k, v in self._store.items()
                          if not (v.get("city") or v.get("state") or v.get("country"))]
            if empty_keys:
                print(f"[GeocoderCache] purging {len(empty_keys)} empty cache entries")
                for k in empty_keys:
                    del self._store[k]
                self._flush()

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    @staticmethod
    def _make_key(lat: float, lon: float) -> str:
        rlat, rlon = _round_key(lat, lon)
        return f"{rlat},{rlon}"

    def _load(self):
        if self._path.exists():
            try:
                with open(self._path, "r", encoding="utf-8") as fh:
                    self._store = json.load(fh)
                print(f"[GeocoderCache] loaded {len(self._store)} entries from {self._path}")
                self.purge_empty()
            except Exception:
                self._store = {}

    def _flush(self):
        """Write the store to disk (must be called inside self._lock)."""
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self._path.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(self._store, fh, ensure_ascii=False)
            tmp.replace(self._path)
        except Exception as exc:
            print(f"[GeocoderCache] flush error: {exc}")

    def _fetch(self, lat: float, lon: float,
               proxy_url: str) -> Dict[str, str]:
        if not _REQUESTS_OK:
            return dict(_EMPTY_LOCATION)

        # Respect Nominatim rate limit (global across all threads)
        with self._lock:
            elapsed = time.monotonic() - self._last_request_time
            if elapsed < self._RATE_LIMIT_S:
                time.sleep(self._RATE_LIMIT_S - elapsed)
            self._last_request_time = time.monotonic()

        proxies = _build_proxies(proxy_url)
        print(f"[GeocoderCache] fetch ({lat:.4f},{lon:.4f}) proxy={proxies}")

        def _do_request(verify: bool) -> dict:
            resp = _requests.get(
                self._NOMINATIM_URL,
                params={"lat": lat, "lon": lon,
                        "format": "json", "addressdetails": 1},
                headers={"User-Agent": self._USER_AGENT},
                proxies=proxies,
                timeout=10,
                verify=verify,
            )
            resp.raise_for_status()
            return resp.json()

        try:
            try:
                data = _do_request(verify=True)
            except _requests.exceptions.SSLError as ssl_err:
                print(f"[GeocoderCache] SSL error, retrying without verification: {ssl_err}")
                import urllib3
                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
                data = _do_request(verify=False)

            addr = data.get("address", {})
            print(f"[GeocoderCache] addr keys: {list(addr.keys())}")
            result = {
                "city": (addr.get("city")
                         or addr.get("town")
                         or addr.get("village")
                         or addr.get("hamlet")
                         or addr.get("suburb")
                         or addr.get("neighbourhood")
                         or addr.get("municipality", "")),
                "county":  addr.get("county", ""),
                "state":   addr.get("state", ""),
                "country": addr.get("country", ""),
                "display": data.get("display_name", ""),
            }
            print(f"[GeocoderCache] parsed: city={result['city']!r}, "
                  f"state={result['state']!r}, country={result['country']!r}")
            return result
        except Exception as exc:
            print(f"[GeocoderCache] fetch error ({lat:.4f},{lon:.4f}): {exc}")
            return dict(_EMPTY_LOCATION)


# ---------------------------------------------------------------------------
# Proxy helper
# ---------------------------------------------------------------------------

def _build_proxies(proxy_url: str) -> Optional[Dict[str, str]]:
    """
    Build a dict suitable for requests' ``proxies`` kwarg.

    Priority:
    1. Explicit proxy_url passed by caller (from config).
    2. HTTPS_PROXY env var  (already covers https).
    3. HTTP_PROXY / http_proxy env var  – applied to BOTH http and https,
       because corporate proxies are often only declared as HTTP_PROXY even
       though they handle HTTPS traffic too.
    4. None  →  no proxy.
    """
    url = proxy_url.strip()
    if not url:
        # Try each env var in priority order; use whichever is set
        url = (os.environ.get("HTTPS_PROXY")
               or os.environ.get("https_proxy")
               or os.environ.get("HTTP_PROXY")
               or os.environ.get("http_proxy", ""))
    if url:
        print(f"[GeocoderCache] using proxy: {url.split('@')[-1]}")  # hide credentials in log
        return {"http": url, "https": url}
    print("[GeocoderCache] no proxy configured")
    return None

