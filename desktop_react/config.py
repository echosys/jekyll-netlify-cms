"""
config.py — Load and save desktop_react app configuration.

Config file: config.json (sits alongside this file).
All keys have sensible defaults so the file is entirely optional.
"""
from __future__ import annotations

import json
import os
from typing import Any

_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

_DEFAULTS: dict[str, Any] = {
    "app_url": "http://localhost:5173/",
    "window_title": "Family Tree App",
    "window_width": 1280,
    "window_height": 800,
    "zoom_factor": 1.0,
    "remember_window_geometry": True,
    "dev_tools_enabled": False,
}


def load() -> dict[str, Any]:
    """Return config merged with defaults (file values take priority)."""
    cfg = dict(_DEFAULTS)
    if os.path.isfile(_CONFIG_PATH):
        try:
            with open(_CONFIG_PATH, "r", encoding="utf-8") as fh:
                cfg.update(json.load(fh))
        except Exception as exc:  # noqa: BLE001
            print(f"[config] Could not read {_CONFIG_PATH}: {exc}")
    return cfg


def save(cfg: dict[str, Any]) -> None:
    """Persist *cfg* back to config.json."""
    try:
        with open(_CONFIG_PATH, "w", encoding="utf-8") as fh:
            json.dump(cfg, fh, indent=2)
    except Exception as exc:  # noqa: BLE001
        print(f"[config] Could not write {_CONFIG_PATH}: {exc}")


def config_path() -> str:
    return _CONFIG_PATH

