"""
EXIF Reader - Extract metadata from images
y Uses PIL's built-in EXIF parser for GPS (handles both float and rational tuples).
piexif is used for datetime/camera fields only.
"""
from pathlib import Path
from datetime import datetime
from typing import Optional, Tuple, Any, Dict
from PIL import Image
from PIL.ExifTags import GPSTAGS
import piexif
import json

# Sentinel value written by some cameras when GPS is unavailable
_GPS_INVALID_SENTINEL = 16777215  # 0xFFFFFF


class ExifReader:
    """Reads EXIF data from image files"""

    @staticmethod
    def read_exif(image_path: Path) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            'datetime': None,
            'gps_latitude': None,
            'gps_longitude': None,
            'width': None,
            'height': None,
            'camera_make': None,
            'camera_model': None,
            'location_city': '',
            'location_county': '',
            'location_state': '',
            'location_country': '',
        }

        try:
            img = Image.open(image_path)
            result['width'], result['height'] = img.size

            # ── GPS via PIL public get_ifd(GPS_IFD_TAG) ─────────────────
            try:
                exif_obj = img.getexif()
                if exif_obj:
                    gps_ifd = exif_obj.get_ifd(0x8825)
                    if gps_ifd:
                        gps = {GPSTAGS.get(k, k): v for k, v in gps_ifd.items()}
                        lat, lon = ExifReader._parse_gps_pil(gps)
                        result['gps_latitude'] = lat
                        result['gps_longitude'] = lon
            except Exception:
                pass

            # ── datetime / camera / location comment via piexif ──────────
            try:
                exif_dict = piexif.load(str(image_path))

                if piexif.ExifIFD.DateTimeOriginal in exif_dict.get("Exif", {}):
                    dt_bytes = exif_dict["Exif"][piexif.ExifIFD.DateTimeOriginal]
                    result['datetime'] = datetime.strptime(
                        dt_bytes.decode('utf-8'), "%Y:%m:%d %H:%M:%S")

                ifd0 = exif_dict.get("0th", {})
                if piexif.ImageIFD.Make in ifd0:
                    result['camera_make'] = ifd0[piexif.ImageIFD.Make].decode('utf-8', errors='replace').strip('\x00')
                if piexif.ImageIFD.Model in ifd0:
                    result['camera_model'] = ifd0[piexif.ImageIFD.Model].decode('utf-8', errors='replace').strip('\x00')

                # Read back location stored by ExifWriter
                loc = ExifReader._read_location_comment(exif_dict)
                if loc:
                    result.update(loc)

            except Exception:
                pass

        except Exception as e:
            print(f"Error reading EXIF from {image_path}: {e}")

        return result

    @staticmethod
    def _read_location_comment(exif_dict: dict) -> Optional[Dict[str, str]]:
        """Read the picasa location JSON stored in EXIF UserComment."""
        try:
            raw = exif_dict.get("Exif", {}).get(piexif.ExifIFD.UserComment, b"")
            if not raw:
                return None
            # UserComment starts with 8-byte charset marker
            text = raw[8:].decode("utf-8", errors="ignore").strip("\x00").strip()
            if not text.startswith("{"):
                return None
            data = json.loads(text)
            if not data.get("_picasa_location"):
                return None
            city    = data.get("city", "")
            county  = data.get("county", "")
            state   = data.get("state", "")
            country = data.get("country", "")
            # Only return if at least one field has a real value
            if not (city or state or country):
                return None
            return {
                "location_city":    city,
                "location_county":  county,
                "location_state":   state,
                "location_country": country,
            }
        except Exception:
            pass
        return None

    @staticmethod
    def _parse_gps_pil(gps: dict) -> Tuple[Optional[float], Optional[float]]:
        """Parse GPS from PIL GPSTAGS dict. Values may be float or IFDRational tuples."""
        try:
            lat_raw = gps.get('GPSLatitude')
            lat_ref = gps.get('GPSLatitudeRef', 'N')
            lon_raw = gps.get('GPSLongitude')
            lon_ref = gps.get('GPSLongitudeRef', 'E')

            if not lat_raw or not lon_raw:
                return None, None

            lat = ExifReader._dms_to_decimal(lat_raw)
            lon = ExifReader._dms_to_decimal(lon_raw)

            if lat is None or lon is None:
                return None, None

            # Apply hemisphere
            if isinstance(lat_ref, bytes):
                lat_ref = lat_ref.decode()
            if isinstance(lon_ref, bytes):
                lon_ref = lon_ref.decode()
            if lat_ref.upper() == 'S':
                lat = -lat
            if lon_ref.upper() == 'W':
                lon = -lon

            # Sanity check: valid WGS-84 range
            if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 180.0):
                return None, None

            return lat, lon

        except Exception:
            return None, None

    @staticmethod
    def _dms_to_decimal(dms) -> Optional[float]:
        """
        Convert (degrees, minutes, seconds) to decimal degrees.
        Each component may be:
          - a float / int  (PIL IFDRational already evaluated)
          - a tuple (numerator, denominator)  (piexif rational)
        """
        try:
            def _val(v: Any) -> float:
                if isinstance(v, tuple) and len(v) == 2:
                    num, den = v
                    return float(num) / float(den) if den else 0.0
                if isinstance(v, (int, float)):
                    return float(v)
                # IFDRational or other numeric type
                return float(str(v))

            d, m, s = dms
            dv, mv, sv = _val(d), _val(m), _val(s)

            # Reject 0xFFFFFF sentinel
            if dv >= _GPS_INVALID_SENTINEL or mv >= _GPS_INVALID_SENTINEL:
                return None

            return dv + mv / 60.0 + sv / 3600.0

        except Exception:
            return None


# ---------------------------------------------------------------------------
# ExifWriter – write GPS + location back to JPEG EXIF in-place
# ---------------------------------------------------------------------------

def _deg_to_rational(value: float):
    """Convert a decimal degree to piexif rational (numerator, denominator)."""
    d = int(abs(value))
    m_full = (abs(value) - d) * 60
    m = int(m_full)
    s_full = (m_full - m) * 60
    # Store seconds as rational with 100x precision
    s_num = int(round(s_full * 100))
    return ((d, 1), (m, 1), (s_num, 100))


class ExifWriter:
    """
    Writes GPS coordinates and location strings back to JPEG EXIF data.

    GPS is stored in the standard GPSInfo IFD (survives any EXIF reader).
    City/state/country is stored as JSON in the EXIF UserComment field
    (prefixed with ASCII marker) so it round-trips perfectly through
    ExifReader._read_location_comment().

    Only JPEG files are supported (piexif limitation).
    RAW, PNG, HEIC etc. are skipped gracefully.
    """

    SUPPORTED = {'.jpg', '.jpeg'}

    @classmethod
    def write_location(cls, image_path: Path,
                       lat: float, lon: float,
                       city: str = "", county: str = "",
                       state: str = "", country: str = "",
                       display: str = "") -> bool:
        """
        Write GPS + location to the JPEG at image_path in-place.
        Existing GPS IFD tags (altitude, bearing, speed, etc.) are PRESERVED –
        only GPSLatitude/Ref and GPSLongitude/Ref are updated.
        Returns True on success, False if skipped or failed.
        """
        if image_path.suffix.lower() not in cls.SUPPORTED:
            print(f"[ExifWriter] skipped (not JPEG): {image_path.name}")
            return False

        try:
            # Load existing EXIF (preserve all existing tags)
            try:
                exif_dict = piexif.load(str(image_path))
            except Exception:
                exif_dict = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}}

            # ── GPS IFD – preserve all existing tags, only update lat/lon ──
            # This keeps altitude, bearing, speed, DOP, satellites etc. intact.
            lat_ref = b"N" if lat >= 0 else b"S"
            lon_ref = b"E" if lon >= 0 else b"W"
            gps_ifd = exif_dict.get("GPS", {})
            gps_ifd[piexif.GPSIFD.GPSVersionID]    = (2, 3, 0, 0)
            gps_ifd[piexif.GPSIFD.GPSLatitudeRef]  = lat_ref
            gps_ifd[piexif.GPSIFD.GPSLatitude]     = _deg_to_rational(lat)
            gps_ifd[piexif.GPSIFD.GPSLongitudeRef] = lon_ref
            gps_ifd[piexif.GPSIFD.GPSLongitude]    = _deg_to_rational(lon)
            exif_dict["GPS"] = gps_ifd

            # ── Location as JSON in UserComment ──────────────────────────
            loc_data = {
                "_picasa_location": True,
                "city":    city,
                "county":  county,
                "state":   state,
                "country": country,
                "display": display,
            }
            json_str = json.dumps(loc_data, ensure_ascii=False)
            # UserComment: 8-byte "ASCII\x00\x00\x00" header + UTF-8 payload
            user_comment = b"ASCII\x00\x00\x00" + json_str.encode("utf-8")
            exif_dict.setdefault("Exif", {})[piexif.ExifIFD.UserComment] = user_comment

            # ── Write back in-place ──────────────────────────────────────
            exif_bytes = piexif.dump(exif_dict)
            piexif.insert(exif_bytes, str(image_path))
            print(f"[ExifWriter] wrote GPS ({lat:.5f},{lon:.5f}) + location "
                  f"city={city!r} state={state!r} display={display[:40]!r} to {image_path.name}")
            return True

        except Exception as exc:
            print(f"[ExifWriter] error writing {image_path.name}: {exc}")
            return False

