"""
generate_sample_tree.py
Run once to create FamilyTrees/sample_family/tree.json with mock data.
Usage:  python generate_sample_tree.py
"""
import json
import os
import uuid

def uid():
    return str(uuid.uuid4())

# ── Node IDs ──────────────────────────────────────────────
george_id   = uid()
eleanor_id  = uid()
thomas_id   = uid()
margaret_id = uid()
alice_id    = uid()
robert_id   = uid()
clara_id    = uid()
henry_id    = uid()

# ── Resource IDs ──────────────────────────────────────────
r_george   = uid(); r_eleanor  = uid(); r_thomas   = uid()
r_margaret = uid(); r_alice    = uid(); r_robert   = uid()
r_clara    = uid(); r_henry    = uid()
r_xmas     = uid(); r_reunion  = uid()

tree = {
    "tree_id":    uid(),
    "tree_name":  "Anderson Family",
    "version":    "1.0",
    "created_at": "2026-03-07T00:00:00Z",
    "updated_at": "2026-03-07T00:00:00Z",

    # ── Nodes ──────────────────────────────────────────────
    "nodes": [
        {
            "id": george_id,
            "name": "George Anderson",
            "birth_date": "1935-04-12",
            "death_date": "2010-11-03",
            "gender": "male",
            "bio": (
                "George was a carpenter and community leader who built the family home "
                "in Vermont. He served in the Korean War and was known for his woodworking "
                "and love of fishing. He was an elder at the local church for over 30 years."
            ),
            "profile_image_ref": "resources/1935-george_anderson.jpg",
            "is_standalone": False,
            "position": {"x": 400, "y": 60},        },
        {
            "id": eleanor_id,
            "name": "Eleanor Anderson",
            "birth_date": "1940-08-22",
            "death_date": None,
            "gender": "female",
            "bio": (
                "Eleanor is a retired schoolteacher who taught elementary school for 35 years "
                "in Burlington. She is an avid gardener and hosts the annual family reunion "
                "every summer. She has been learning watercolour painting since retirement."
            ),
            "profile_image_ref": "resources/1940-eleanor_anderson.jpg",
            "is_standalone": False,
            "position": {"x": 640, "y": 60},
        },
        {
            "id": thomas_id,
            "name": "Thomas Anderson",
            "birth_date": "1962-02-14",
            "death_date": None,
            "gender": "male",
            "bio": (
                "Thomas is a civil engineer based in Boston, specialising in bridge design. "
                "He and his wife Margaret have two children, Robert and Clara. "
                "He coaches youth soccer on weekends and is a passionate fly-fisherman."
            ),
            "profile_image_ref": "resources/1962-thomas_anderson.jpg",
            "is_standalone": False,
            "position": {"x": 160, "y": 280},
        },
        {
            "id": margaret_id,
            "name": "Margaret Anderson",
            "birth_date": "1964-07-30",
            "death_date": None,
            "gender": "female",
            "bio": (
                "Margaret is a pediatric nurse at Boston Children's Hospital. "
                "She grew up in Portland, Maine and met Thomas at UVM. "
                "She has climbed all 48 New Hampshire 4000-footers and is training for her "
                "first marathon."
            ),
            "profile_image_ref": "resources/1964-margaret_anderson.jpg",
            "is_standalone": False,
            "position": {"x": 400, "y": 280},
        },
        {
            "id": alice_id,
            "name": "Alice Anderson",
            "birth_date": "1965-12-05",
            "death_date": None,
            "gender": "female",
            "bio": (
                "Alice is a graphic designer and the youngest child of George and Eleanor. "
                "She lives in Portland, Oregon, and specialises in book-cover and editorial "
                "design. Her son Henry inherited her eye for visual storytelling."
            ),
            "profile_image_ref": "resources/1965-alice_anderson.jpg",
            "is_standalone": False,
            "position": {"x": 700, "y": 280},
        },
        {
            "id": robert_id,
            "name": "Robert Anderson",
            "birth_date": "1988-09-17",
            "death_date": None,
            "gender": "male",
            "bio": (
                "Robert is a senior software engineer at a Bay Area startup. "
                "He is the eldest child of Thomas and Margaret. "
                "Outside work he brews his own beer and volunteers at a local food bank."
            ),
            "profile_image_ref": "resources/1988-robert_anderson.jpg",
            "is_standalone": False,
            "position": {"x": 80, "y": 500},
        },
        {
            "id": clara_id,
            "name": "Clara Anderson",
            "birth_date": "1990-03-25",
            "death_date": None,
            "gender": "female",
            "bio": (
                "Clara is a medical resident at Johns Hopkins Hospital, specialising in "
                "geriatrics. She plays violin in a local chamber orchestra and volunteers "
                "at a free clinic on weekends."
            ),
            "profile_image_ref": "resources/1990-clara_anderson.jpg",
            "is_standalone": False,
            "position": {"x": 320, "y": 500},
        },
        {
            "id": henry_id,
            "name": "Henry Anderson",
            "birth_date": "1992-06-11",
            "death_date": None,
            "gender": "male",
            "bio": (
                "Henry is Alice's son and a freelance travel photographer based in New York. "
                "His work has appeared in National Geographic Traveller, Conde Nast, and "
                "several independent zines. He is currently working on a book about "
                "vanishing rural landscapes."
            ),
            "profile_image_ref": "resources/1992-henry_anderson.jpg",
            "is_standalone": False,
            "position": {"x": 720, "y": 500},
        },
    ],

    # ── Edges — label derived from source node gender ───────────────
    "edges": [
        {"id": uid(), "source": george_id,   "target": eleanor_id,  "relationship": "spouse",  "label": "Spouse"},
        {"id": uid(), "source": george_id,   "target": thomas_id,   "relationship": "parent",  "label": "Father of"},
        {"id": uid(), "source": george_id,   "target": alice_id,    "relationship": "parent",  "label": "Father of"},
        {"id": uid(), "source": eleanor_id,  "target": thomas_id,   "relationship": "parent",  "label": "Mother of"},
        {"id": uid(), "source": eleanor_id,  "target": alice_id,    "relationship": "parent",  "label": "Mother of"},
        {"id": uid(), "source": thomas_id,   "target": margaret_id, "relationship": "spouse",  "label": "Spouse"},
        {"id": uid(), "source": thomas_id,   "target": robert_id,   "relationship": "parent",  "label": "Father of"},
        {"id": uid(), "source": thomas_id,   "target": clara_id,    "relationship": "parent",  "label": "Father of"},
        {"id": uid(), "source": margaret_id, "target": robert_id,   "relationship": "parent",  "label": "Mother of"},
        {"id": uid(), "source": margaret_id, "target": clara_id,    "relationship": "parent",  "label": "Mother of"},
        {"id": uid(), "source": alice_id,    "target": henry_id,    "relationship": "parent",  "label": "Mother of"},
        {"id": uid(), "source": robert_id,   "target": clara_id,    "relationship": "sibling", "label": "Sibling"},
    ],

    # ── Resources ──────────────────────────────────────────
    "resources": [
        {
            "id": r_george,
            "filename": "1935-george_anderson.jpg",
            "original_filename": "george_portrait.jpg",
            "tags": {
                "persons": [george_id],
                "date": "1935-04-12",
                "location": "Burlington, Vermont",
                "gps": {"lat": 44.4759, "lng": -73.2121},
                "custom_tags": ["portrait"],
            },
            "regions": [{"node_id": george_id, "rect": {"x": 20, "y": 12, "w": 60, "h": 56}, "use_as_profile": True}],
        },
        {
            "id": r_eleanor,
            "filename": "1940-eleanor_anderson.jpg",
            "original_filename": "eleanor_portrait.jpg",
            "tags": {
                "persons": [eleanor_id],
                "date": "1940-08-22",
                "location": "Burlington, Vermont",
                "gps": {"lat": 44.4759, "lng": -73.2121},
                "custom_tags": ["portrait"],
            },
            "regions": [{"node_id": eleanor_id, "rect": {"x": 20, "y": 12, "w": 60, "h": 56}, "use_as_profile": True}],
        },
        {
            "id": r_thomas,
            "filename": "1962-thomas_anderson.jpg",
            "original_filename": "thomas_portrait.jpg",
            "tags": {
                "persons": [thomas_id],
                "date": "1962-02-14",
                "location": "Boston, Massachusetts",
                "gps": {"lat": 42.3601, "lng": -71.0589},
                "custom_tags": ["portrait"],
            },
            "regions": [{"node_id": thomas_id, "rect": {"x": 20, "y": 12, "w": 60, "h": 56}, "use_as_profile": True}],
        },
        {
            "id": r_margaret,
            "filename": "1964-margaret_anderson.jpg",
            "original_filename": "margaret_portrait.jpg",
            "tags": {
                "persons": [margaret_id],
                "date": "1964-07-30",
                "location": "Portland, Maine",
                "gps": {"lat": 43.6591, "lng": -70.2568},
                "custom_tags": ["portrait"],
            },
            "regions": [{"node_id": margaret_id, "rect": {"x": 20, "y": 12, "w": 60, "h": 56}, "use_as_profile": True}],
        },
        {
            "id": r_alice,
            "filename": "1965-alice_anderson.jpg",
            "original_filename": "alice_portrait.jpg",
            "tags": {
                "persons": [alice_id],
                "date": "1965-12-05",
                "location": "Portland, Oregon",
                "gps": {"lat": 45.5051, "lng": -122.6750},
                "custom_tags": ["portrait"],
            },
            "regions": [{"node_id": alice_id, "rect": {"x": 20, "y": 12, "w": 60, "h": 56}, "use_as_profile": True}],
        },
        {
            "id": r_robert,
            "filename": "1988-robert_anderson.jpg",
            "original_filename": "robert_portrait.jpg",
            "tags": {
                "persons": [robert_id],
                "date": "1988-09-17",
                "location": "San Francisco, California",
                "gps": {"lat": 37.7749, "lng": -122.4194},
                "custom_tags": ["portrait"],
            },
            "regions": [{"node_id": robert_id, "rect": {"x": 20, "y": 12, "w": 60, "h": 56}, "use_as_profile": True}],
        },
        {
            "id": r_clara,
            "filename": "1990-clara_anderson.jpg",
            "original_filename": "clara_portrait.jpg",
            "tags": {
                "persons": [clara_id],
                "date": "1990-03-25",
                "location": "Baltimore, Maryland",
                "gps": {"lat": 39.2904, "lng": -76.6122},
                "custom_tags": ["portrait"],
            },
            "regions": [{"node_id": clara_id, "rect": {"x": 20, "y": 12, "w": 60, "h": 56}, "use_as_profile": True}],
        },
        {
            "id": r_henry,
            "filename": "1992-henry_anderson.jpg",
            "original_filename": "henry_portrait.jpg",
            "tags": {
                "persons": [henry_id],
                "date": "1992-06-11",
                "location": "New York, New York",
                "gps": {"lat": 40.7128, "lng": -74.0060},
                "custom_tags": ["portrait"],
            },
            "regions": [{"node_id": henry_id, "rect": {"x": 20, "y": 12, "w": 60, "h": 56}, "use_as_profile": True}],
        },
        {
            "id": r_xmas,
            "filename": "1985-christmas_family_reunion.jpg",
            "original_filename": "xmas_1985.jpg",
            "tags": {
                "persons": [george_id, eleanor_id, thomas_id, alice_id],
                "date": "1985-12-25",
                "location": "Burlington, Vermont",
                "gps": {"lat": 44.4759, "lng": -73.2121},
                "custom_tags": ["christmas", "reunion", "holiday"],
            },
            "regions": [
                {"node_id": george_id,  "rect": {"x": 5,  "y": 30, "w": 13, "h": 38}, "use_as_profile": False},
                {"node_id": eleanor_id, "rect": {"x": 22, "y": 30, "w": 13, "h": 38}, "use_as_profile": False},
                {"node_id": thomas_id,  "rect": {"x": 39, "y": 30, "w": 13, "h": 38}, "use_as_profile": False},
                {"node_id": alice_id,   "rect": {"x": 68, "y": 30, "w": 13, "h": 38}, "use_as_profile": False},
            ],
        },
        {
            "id": r_reunion,
            "filename": "2005-anderson_family_reunion.jpg",
            "original_filename": "reunion_2005.jpg",
            "tags": {
                "persons": [
                    george_id, eleanor_id, thomas_id, margaret_id,
                    alice_id, robert_id, clara_id, henry_id,
                ],
                "date": "2005-07-04",
                "location": "Burlington, Vermont",
                "gps": {"lat": 44.4759, "lng": -73.2121},
                "custom_tags": ["reunion", "whole family", "summer"],
            },
            "regions": [
                {"node_id": george_id,   "rect": {"x": 5,  "y": 30, "w": 10, "h": 38}, "use_as_profile": False},
                {"node_id": eleanor_id,  "rect": {"x": 17, "y": 30, "w": 10, "h": 38}, "use_as_profile": False},
                {"node_id": thomas_id,   "rect": {"x": 29, "y": 30, "w": 10, "h": 38}, "use_as_profile": False},
                {"node_id": margaret_id, "rect": {"x": 41, "y": 30, "w": 10, "h": 38}, "use_as_profile": False},
                {"node_id": alice_id,    "rect": {"x": 53, "y": 30, "w": 10, "h": 38}, "use_as_profile": False},
                {"node_id": robert_id,   "rect": {"x": 65, "y": 30, "w": 10, "h": 38}, "use_as_profile": False},
                {"node_id": clara_id,    "rect": {"x": 77, "y": 30, "w": 10, "h": 38}, "use_as_profile": False},
                {"node_id": henry_id,    "rect": {"x": 89, "y": 30, "w": 10, "h": 38}, "use_as_profile": False},
            ],
        },
    ],
}

out_path = os.path.join(
    os.path.dirname(__file__), "FamilyTrees", "sample_family", "tree.json"
)
res_dir = os.path.join(os.path.dirname(__file__), "FamilyTrees", "sample_family", "resources")
os.makedirs(res_dir, exist_ok=True)

# ── Generate placeholder images for any that don't exist yet ──────────
try:
    from PIL import Image, ImageDraw, ImageFont
    _has_pil = True
except ImportError:
    _has_pil = False

def _make_placeholder(filename: str, label: str, bg_color: tuple):
    """Create a simple solid-colour placeholder JPEG if it doesn't exist."""
    path = os.path.join(res_dir, filename)
    if os.path.exists(path):
        return
    if not _has_pil:
        # write a minimal 1x1 JPEG as fallback
        import struct, zlib
        # tiny valid JPEG (1x1 grey)
        tiny = (
            b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
            b'\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t'
            b'\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a'
            b'\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\x1e=\xcf'
            b'\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00'
            b'\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00'
            b'\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b'
            b'\xff\xc4\x00\xb5\x10\x00\x02\x01\x03\x03\x02\x04\x03\x05\x05\x04'
            b'\x04\x00\x00\x01}\x01\x02\x03\x00\x04\x11\x05\x12!1A\x06\x13Qa'
            b'\x07"q\x142\x81\x91\xa1\x08#B\xb1\xc1\x15R\xd1\xf0$3br'
        )
        with open(path, 'wb') as f:
            f.write(tiny)
        return

    img = Image.new("RGB", (400, 400), color=bg_color)
    draw = ImageDraw.Draw(img)
    # draw a simple face-like circle
    draw.ellipse([120, 60, 280, 220], fill=(220, 190, 160), outline=(180,150,120), width=3)
    draw.ellipse([155, 110, 180, 130], fill=(80, 60, 40))   # left eye
    draw.ellipse([220, 110, 245, 130], fill=(80, 60, 40))   # right eye
    draw.arc([160, 150, 240, 190], start=0, end=180, fill=(120, 60, 60), width=3)  # smile
    # body
    draw.ellipse([130, 230, 270, 380], fill=(bg_color[0]//2+80, bg_color[1]//2+80, bg_color[2]//2+80))
    # name label at bottom
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 22)
    except Exception:
        font = ImageFont.load_default()
    text_w = draw.textlength(label, font=font) if hasattr(draw, 'textlength') else len(label)*12
    draw.text(((400 - text_w) / 2, 355), label, fill=(30, 30, 30), font=font)
    img.save(path, "JPEG", quality=88)


# portrait placeholders  (bg colours: blue tones for males, rose for females)
_make_placeholder("1935-george_anderson.jpg",   "George",   (180, 210, 240))
_make_placeholder("1940-eleanor_anderson.jpg",  "Eleanor",  (240, 200, 210))
_make_placeholder("1962-thomas_anderson.jpg",   "Thomas",   (190, 215, 245))
_make_placeholder("1964-margaret_anderson.jpg", "Margaret", (245, 205, 215))
_make_placeholder("1965-alice_anderson.jpg",    "Alice",    (240, 200, 215))
_make_placeholder("1988-robert_anderson.jpg",   "Robert",   (185, 215, 245))
_make_placeholder("1990-clara_anderson.jpg",    "Clara",    (245, 200, 210))
_make_placeholder("1992-henry_anderson.jpg",    "Henry",    (180, 210, 240))
_make_placeholder("1985-christmas_family_reunion.jpg", "Xmas 1985", (230, 240, 210))
_make_placeholder("2005-anderson_family_reunion.jpg",  "Reunion 2005", (220, 235, 220))

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(tree, f, indent=2, ensure_ascii=False)

print(f"Written: {out_path}")
print(f"  {len(tree['nodes'])} nodes, {len(tree['edges'])} edges, {len(tree['resources'])} resources")
created = [fn for fn in os.listdir(res_dir) if fn.endswith('.jpg')]
print(f"  {len(created)} image files in resources/")

