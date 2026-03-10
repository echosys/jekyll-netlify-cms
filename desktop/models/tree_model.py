"""
tree_model.py — Data classes for the family tree schema v1.0
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


def new_id() -> str:
    return str(uuid.uuid4())


@dataclass
class Position:
    x: float = 0.0
    y: float = 0.0

    def to_dict(self) -> dict:
        return {"x": self.x, "y": self.y}

    @staticmethod
    def from_dict(d: dict) -> "Position":
        return Position(x=float(d.get("x", 0)), y=float(d.get("y", 0)))


# Gender constants — stored as lowercase strings in JSON
GENDER_MALE    = "male"
GENDER_FEMALE  = "female"
GENDER_OTHER   = "other"
GENDER_UNKNOWN = "unknown"
GENDER_OPTIONS = [GENDER_UNKNOWN, GENDER_MALE, GENDER_FEMALE, GENDER_OTHER]


@dataclass
class Node:
    id: str = field(default_factory=new_id)
    name: str = ""
    birth_date: Optional[str] = None      # ISO 8601 date string e.g. "1950-01-01"
    death_date: Optional[str] = None
    gender: str = GENDER_UNKNOWN          # male | female | other | unknown
    bio: str = ""
    profile_image_ref: Optional[str] = None   # relative path e.g. "resources/file.jpg"
    is_standalone: bool = False
    position: Position = field(default_factory=Position)
    links: list = field(default_factory=list)  # list of {"label": str, "url": str}

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "birth_date": self.birth_date,
            "death_date": self.death_date,
            "gender": self.gender,
            "bio": self.bio,
            "profile_image_ref": self.profile_image_ref,
            "is_standalone": self.is_standalone,
            "position": self.position.to_dict(),
            "links": self.links,
        }

    @staticmethod
    def from_dict(d: dict) -> "Node":
        return Node(
            id=d.get("id", new_id()),
            name=d.get("name", ""),
            birth_date=d.get("birth_date"),
            death_date=d.get("death_date"),
            gender=d.get("gender", GENDER_UNKNOWN),
            bio=d.get("bio", ""),
            profile_image_ref=d.get("profile_image_ref"),
            is_standalone=d.get("is_standalone", False),
            position=Position.from_dict(d.get("position", {})),
            links=d.get("links", []),
        )

    def parent_label(self) -> str:
        """Return 'Father of', 'Mother of', or 'Parent of' based on gender."""
        if self.gender == GENDER_MALE:
            return "Father of"
        if self.gender == GENDER_FEMALE:
            return "Mother of"
        return "Parent of"

    def birth_year(self) -> Optional[str]:
        if self.birth_date and len(self.birth_date) >= 4:
            return self.birth_date[:4]
        return None

    def death_year(self) -> Optional[str]:
        if self.death_date and len(self.death_date) >= 4:
            return self.death_date[:4]
        return None

    def years_label(self) -> str:
        by = self.birth_year() or "?"
        if self.death_date:
            return f"{by} – {self.death_year() or '?'}"
        return f"b. {by}"


@dataclass
class Edge:
    id: str = field(default_factory=new_id)
    source: str = ""          # Node.id
    target: str = ""          # Node.id
    relationship: str = "parent"   # parent | spouse | sibling | other
    label: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "source": self.source,
            "target": self.target,
            "relationship": self.relationship,
            "label": self.label,
        }

    @staticmethod
    def from_dict(d: dict) -> "Edge":
        return Edge(
            id=d.get("id", new_id()),
            source=d.get("source", ""),
            target=d.get("target", ""),
            relationship=d.get("relationship", "parent"),
            label=d.get("label", ""),
        )


@dataclass
class Tree:
    tree_id: str = field(default_factory=new_id)
    tree_name: str = "My Family"
    version: str = "1.0"
    created_at: str = field(
        default_factory=lambda: datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    )
    updated_at: str = field(
        default_factory=lambda: datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    )
    nodes: list[Node] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)
    resources: list = field(default_factory=list)  # list[Resource] — imported lazily

    def touch(self):
        self.updated_at = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    def get_node(self, node_id: str) -> Optional[Node]:
        for n in self.nodes:
            if n.id == node_id:
                return n
        return None

    def to_dict(self) -> dict:
        from models.resource_model import Resource  # avoid circular import
        return {
            "tree_id": self.tree_id,
            "tree_name": self.tree_name,
            "version": self.version,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "nodes": [n.to_dict() for n in self.nodes],
            "edges": [e.to_dict() for e in self.edges],
            "resources": [
                r.to_dict() if isinstance(r, Resource) else r
                for r in self.resources
            ],
        }

    @staticmethod
    def from_dict(d: dict) -> "Tree":
        from models.resource_model import Resource  # avoid circular import
        t = Tree(
            tree_id=d.get("tree_id", new_id()),
            tree_name=d.get("tree_name", "My Family"),
            version=d.get("version", "1.0"),
            created_at=d.get("created_at", ""),
            updated_at=d.get("updated_at", ""),
            nodes=[Node.from_dict(n) for n in d.get("nodes", [])],
            edges=[Edge.from_dict(e) for e in d.get("edges", [])],
            resources=[Resource.from_dict(r) for r in d.get("resources", [])],
        )
        return t

