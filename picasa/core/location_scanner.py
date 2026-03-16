"""
LocationScanner – background QRunnable that reverse-geocodes photos.

Emits per-photo and completion signals so the UI can update incrementally
without freezing.

Signal protocol
---------------
* progress(done: int, total: int)        – update progress bar
* photo_geocoded(photo_path: str,        – one photo finished
                 city: str, county: str,
                 state: str, country: str)
* finished()                             – all done (or cancelled)
"""

from __future__ import annotations

from typing import List

from PyQt6.QtCore import QRunnable, QObject, pyqtSignal

from core.models import Photo
from utils.geocoder import GeocoderCache
from utils.exif_reader import ExifWriter


class LocationScannerSignals(QObject):
    progress      = pyqtSignal(int, int)          # done, total
    photo_geocoded = pyqtSignal(str, str, str, str, str, str)  # path, city, county, state, country, display
    finished      = pyqtSignal()


class LocationScannerWorker(QRunnable):
    """
    Iterates over *photos*, reverse-geocodes any that have GPS but no
    cached location, and emits signals for UI updates.

    Parameters
    ----------
    photos      : photos to process (all of them; those without GPS or
                  already geocoded are skipped quickly)
    cache       : shared GeocoderCache instance
    proxy_url   : explicit proxy URL or "" to auto-detect
    """

    def __init__(self, photos: List[Photo],
                 cache: GeocoderCache,
                 proxy_url: str = ""):
        super().__init__()
        self.photos    = photos
        self.cache     = cache
        self.proxy_url = proxy_url
        self.signals   = LocationScannerSignals()
        self._cancelled = False
        self.setAutoDelete(True)

    def cancel(self):
        self._cancelled = True

    # ------------------------------------------------------------------

    def run(self):
        # Only process photos that actually lack resolved location info.
        # This prevents redundant processing of photos already restored from cache.
        target_photos = [
            p for p in self.photos
            if p.has_gps() and not (p.location_city or p.location_state)
        ]

        if not target_photos:
            self.signals.finished.emit()
            return

        # Photos that need network lookup
        need_geocode = [
            p for p in target_photos
            if not self.cache.has(p.gps_latitude, p.gps_longitude)  # type: ignore[arg-type]
        ]
        # Photos whose location is already in geocode cache (fast path)
        already_cached = [
            p for p in target_photos
            if self.cache.has(p.gps_latitude, p.gps_longitude)  # type: ignore[arg-type]
        ]

        print(f"[LocationScanner] run: {len(target_photos)} targets, "
              f"{len(already_cached)} hit geocode cache, {len(need_geocode)} need network")

        def _emit_and_write(p: Photo, loc: dict):
            """Emit signal and persist to EXIF only when we have real data."""
            city    = loc["city"]
            county  = loc["county"]
            state   = loc["state"]
            country = loc["country"]
            display = loc.get("display", "")
            self.signals.photo_geocoded.emit(str(p.path), city, county, state, country, display)

            has_data = bool(city or state or country)
            if not has_data:
                return

            already_written = bool(p.location_city or p.location_state)
            display_missing = bool(display and not p.location_display)

            # Write when:
            #  - location not yet in EXIF at all, OR
            #  - location is there but display_name was added later and is still missing
            if not already_written or display_missing:
                lat, lon = p.gps_latitude, p.gps_longitude
                assert lat is not None and lon is not None
                reason = "first write" if not already_written else "backfilling display"
                print(f"[LocationScanner] writing EXIF for {p.filename} ({reason})")
                ExifWriter.write_location(p.path, lat, lon,
                                          city=city, county=county,
                                          state=state, country=country,
                                          display=display)

        # Emit cached results immediately
        for p in already_cached:
            if self._cancelled:
                break
            lat, lon = p.gps_latitude, p.gps_longitude
            assert lat is not None and lon is not None
            loc = self.cache.get_cached(lat, lon)
            if loc:
                _emit_and_write(p, loc)

        total = len(need_geocode)
        done  = 0
        if total > 0:
            self.signals.progress.emit(done, total)

        for p in need_geocode:
            if self._cancelled:
                break
            lat, lon = p.gps_latitude, p.gps_longitude
            assert lat is not None and lon is not None
            print(f"[LocationScanner] geocoding {p.filename} ({lat:.4f},{lon:.4f})...")
            loc = self.cache.lookup(lat, lon, self.proxy_url)
            done += 1
            _emit_and_write(p, loc)
            self.signals.progress.emit(done, total)

        self.signals.finished.emit()

