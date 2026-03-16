# 20260305 Debug – GPS Not Parsed (get_ifd vs getexif iteration)

## Symptom
After the previous fix (switching from piexif to PIL for GPS), GPS coordinates were still
returning `None` for all photos even when the EXIF clearly contained GPS data.

## Root Cause

`img.getexif()` returns the main EXIF IFD. When iterated, tag `34853` (`GPSInfo`) appears
as just an **integer offset** pointing to the GPS sub-IFD in the JPEG file:

```
getexif() keys: [34853]
tag 34853 (GPSInfo): 26    ← this is a byte offset, not the GPS dict
```

The previous fix tried:
```python
for tag_id, value in exif_obj.items():
    if TAGS.get(tag_id) == 'GPSInfo':
        gps = {GPSTAGS.get(k,k): v for k, v in value.items()}  # FAILS – value is int 26
```
`value.items()` fails silently because `value` is `26` (an int), not a dict.

## Fix (`utils/exif_reader.py`)

Use `get_ifd(0x8825)` which PIL specifically provides to **expand** the GPS sub-IFD
pointer into the actual key/value mapping:

```python
gps_ifd = exif_obj.get_ifd(0x8825)   # 0x8825 == 34853 == GPSInfo
if gps_ifd:
    gps = {GPSTAGS.get(k, k): v for k, v in gps_ifd.items()}
    lat, lon = ExifReader._parse_gps_pil(gps)
```

## Verified Results

| Photo | Parsed GPS |
|---|---|
| eiffel-tower.jpg | lat=48.85826, lon=2.29450 ✓ |
| golden-gate-bridge.jpg | lat=37.81762, lon=-122.47831 ✓ |
| taj-mahal,-india.jpg | lat=27.17501, lon=78.04210 ✓ |
| great-wall-of-china.jpg | lat=40.38086, lon=116.00589 ✓ |
| kawasan-falls.jpg | lat=9.80200, lon=123.37394 ✓ |
| ark-of-bukhara.jpg | lat=39.77795, lon=64.40948 ✓ |
| Panasonic w/ 0xFFFFFF sentinel | None (correctly rejected) ✓ |

