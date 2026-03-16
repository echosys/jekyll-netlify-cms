"""
resource_model.py — Data classes for image resources, tags, and face regions.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional
from models.tree_model import new_id


@dataclass
class Rect:
    x: float = 0.0
    y: float = 0.0
    w: float = 50.0
    h: float = 50.0

    def to_dict(self) -> dict:
        return {"x": self.x, "y": self.y, "w": self.w, "h": self.h}

    @staticmethod
    def from_dict(d: dict) -> "Rect":
        return Rect(
            x=float(d.get("x", 0)),
            y=float(d.get("y", 0)),
            w=float(d.get("w", 50)),
            h=float(d.get("h", 50)),
        )


@dataclass
class Region:
    """A tagged face/person region within a photo."""
    node_id: str = ""
    rect: Rect = field(default_factory=Rect)
    use_as_profile: bool = False

    def to_dict(self) -> dict:
        return {
            "node_id": self.node_id,
            "rect": self.rect.to_dict(),
            "use_as_profile": self.use_as_profile,
        }

    @staticmethod
    def from_dict(d: dict) -> "Region":
        return Region(
            node_id=d.get("node_id", ""),
            rect=Rect.from_dict(d.get("rect", {})),
            use_as_profile=d.get("use_as_profile", False),
        )


@dataclass
class ResourceTags:
    persons: list[str] = field(default_factory=list)   # list of node UUIDs
    date: Optional[str] = None
    location: Optional[str] = None
    gps: Optional[dict] = None      # {"lat": float, "lng": float}
    custom_tags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "persons": self.persons,
            "date": self.date,
            "location": self.location,
            "gps": self.gps,
            "custom_tags": self.custom_tags,
        }

    @staticmethod
    def from_dict(d: dict) -> "ResourceTags":
        return ResourceTags(
            persons=d.get("persons", []),
            date=d.get("date"),
            location=d.get("location"),
            gps=d.get("gps"),
            custom_tags=d.get("custom_tags", []),
        )


@dataclass
class Resource:
    id: str = field(default_factory=new_id)
    filename: str = ""              # current filename in resources/ folder
    original_filename: str = ""     # original upload name
    tags: ResourceTags = field(default_factory=ResourceTags)
    regions: list[Region] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "filename": self.filename,
            "original_filename": self.original_filename,
            "tags": self.tags.to_dict(),
            "regions": [r.to_dict() for r in self.regions],
        }

    @staticmethod
    def from_dict(d: dict) -> "Resource":
        return Resource(
            id=d.get("id", new_id()),
            filename=d.get("filename", ""),
            original_filename=d.get("original_filename", ""),
            tags=ResourceTags.from_dict(d.get("tags", {})),
            regions=[Region.from_dict(r) for r in d.get("regions", [])],
        )

    def tagged_person_ids(self) -> list[str]:
        """Return all node IDs tagged in this resource (top-level + regions)."""
        ids = list(self.tags.persons)
        for reg in self.regions:
            if reg.node_id and reg.node_id not in ids:
                ids.append(reg.node_id)
        return ids

