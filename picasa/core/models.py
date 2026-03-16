"""
Photo Management Application - Data Models
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List
from pathlib import Path


@dataclass
class Photo:
    """Represents a photo or video file"""
    path: Path
    filename: str
    size: int
    created_time: datetime
    modified_time: datetime
    thumbnail_path: Optional[Path] = None

    # EXIF data
    exif_datetime: Optional[datetime] = None
    gps_latitude: Optional[float] = None
    gps_longitude: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    camera_make: Optional[str] = None
    camera_model: Optional[str] = None

    # Reverse-geocoded location (populated lazily by LocationScannerWorker)
    location_city:    str = ""
    location_county:  str = ""
    location_state:   str = ""
    location_country: str = ""
    location_display: str = ""   # full formatted address from Nominatim display_name

    # File type
    is_video: bool = False
    file_type: str = ""

    def get_display_time(self) -> datetime:
        """Get the best available timestamp for display"""
        return self.exif_datetime or self.created_time

    def has_gps(self) -> bool:
        """Check if photo has GPS coordinates"""
        return self.gps_latitude is not None and self.gps_longitude is not None


@dataclass
class Workspace:
    """Represents a workspace (folder) containing photos"""
    path: Path
    name: str
    is_active: bool = True
    photo_count: int = 0
    last_scanned: Optional[datetime] = None
    photos: List[Photo] = field(default_factory=list)

    def __post_init__(self):
        if not self.name:
            self.name = self.path.name or str(self.path)
