# 20260307 · Feature: Timeline Sort by Location

**Date**: 2026-03-07  
**Type**: Feature  
**Summary**: Add "By Location" sort mode to the Timeline tab with async reverse geocoding, location grouping, search, and jump index.

---

## Problem

The Timeline tab only supported sorting by time and file size. Photos with GPS data had no way to be browsed geographically. Searching "Florida" to find Miami photos was impossible.

---

## Solution Overview

1. **Reverse-geocode GPS → city/state/country** using Nominatim (OpenStreetMap free API, no key needed).
2. **Cache results on disk** so each coordinate is only fetched once, ever.
3. **Stream results to the UI** via Qt signals so the view updates without freezing.
4. **Group photos by location + time** with clear rules.
5. **Search bar** that matches any level (city → county → state → country), so "florida" finds Miami photos.

---

## Files Changed

| File | Change |
|------|--------|
| `utils/geocoder.py` | **New** – `GeocoderCache`: Nominatim reverse geocode, disk-backed JSON cache, system proxy auto-detect |
| `core/location_scanner.py` | **New** – `LocationScannerWorker` QRunnable: background geocoding with progress/result signals |
| `core/models.py` | **Modified** – Added `location_city`, `location_county`, `location_state`, `location_country` fields to `Photo` |
| `ui/timeline_view.py` | **Modified** – Added "By Location" combo option, `_LocationGroup` class, grouping logic, search bar, geocoding progress bar, jump index with YYYY-MM labels |
| `ui/main_window.py` | **Modified** – Added `GeocoderCache` init, `start_location_scan()`, geocoder signal wiring, worker cancel on close |
| `requirements.txt` | **Modified** – Added `requests>=2.28.0` |
| `feature.md` | **Modified** – Documented all new behaviour |

---

## Design Decisions

### Why not write to EXIF?
Writing to EXIF requires `exiftool` (external binary) and modifies the original file.  
Instead, location data is stored in:
- **Memory** – on the `Photo` object during the session.
- **`geocode_cache.json`** – keyed by `lat,lon` (3 dp precision), survives restarts.

This is non-destructive, portable, and fast.

### Why Nominatim?
- Free, no API key, based on OpenStreetMap.
- Rate limit: 1 request/second (enforced by `GeocoderCache._RATE_LIMIT_S`).
- Returns structured `address.city`, `address.state`, `address.country`.

### Proxy handling
Priority: explicit `map_proxy` config → `HTTPS_PROXY` env var → `HTTP_PROXY` env var → no proxy.  
Handled in `utils/geocoder._build_proxies()`.

---

## Grouping Logic (detail)

```
Photos sorted newest → oldest

current_group = None
for photo in sorted_photos:
    if current_group is None:
        start group with photo
        continue

    age_days = (group.first_dt - photo.date).days

    same_state = (photo has no state) OR
                 (group has no state yet) OR
                 (photo.state == group.state)

    state_split = NOT same_state AND len(group) >= 30
    span_split  = age_days > 180

    if state_split OR span_split:
        finalize current_group
        start new group with photo
    else:
        add photo to current_group
```

**Group header** = top-3 cities by frequency + state name, e.g. `Chandler  ·  Tempe  ·  Arizona`  
**Jump index label** = `YYYY-MM` of the group's most-recent photo

---

## Search

The search bar (visible only in Location mode) filters groups by checking if the query string
appears anywhere in: group state, header label, or any photo's city/county/state/country.

"florida" → matches groups that contain photos from any Florida city.  
"miami" → matches only groups that contain Miami photos.  
"2025" → would match groups where a location string happens to contain "2025" (unlikely but supported).

---

## UI Flow

```
User selects "By Location"
        │
        ▼
Search bar appears
TimelineView._request_geocoding()
        │
        ▼
MainWindow.start_location_scan()
  → LocationScannerWorker queued in QThreadPool
        │
        ├─ Already-cached photos: signal fired immediately (no network)
        │
        ├─ GPS photos needing geocode:
        │      Nominatim API call (rate-limited 1/s)
        │      → result cached to geocode_cache.json
        │      → photo_geocoded signal fired
        │
        └─ No-GPS photos: skipped
              ↓
    MainWindow._on_photo_geocoded()
    → timeline_view.apply_geocode_result()  [cross-thread via Qt signal]
    → photo.location_* fields updated
    → every 50 results: _rebuild_location_view()
              ↓
    Worker finished:
    → notify_geocode_finished()
    → final _rebuild_location_view()
    → progress bar hidden
```

---

## Testing Notes

- Photos with no GPS are grouped with the nearest temporal neighbours (no crash).
- Switching away from "By Location" and back re-uses already-cached data (instant).
- Running with no internet: cached coords still load; new coords are stored as empty strings (no crash).
- `start_location_scan()` is safe to call multiple times – cancels the previous worker first.

