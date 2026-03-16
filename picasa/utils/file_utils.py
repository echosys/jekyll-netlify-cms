"""
File Utilities - Helper functions for file operations
"""
from pathlib import Path
from typing import Set

# Supported file extensions
IMAGE_EXTENSIONS: Set[str] = {
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif',
    '.webp', '.heic', '.heif', '.raw', '.cr2', '.nef', '.arw', '.dng'
}

VIDEO_EXTENSIONS: Set[str] = {
    '.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg'
}

ALL_MEDIA_EXTENSIONS: Set[str] = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS


def is_image_file(path: Path) -> bool:
    """Check if file is a supported image"""
    return path.suffix.lower() in IMAGE_EXTENSIONS


def is_video_file(path: Path) -> bool:
    """Check if file is a supported video"""
    return path.suffix.lower() in VIDEO_EXTENSIONS


def is_media_file(path: Path) -> bool:
    """Check if file is a supported media file (image or video)"""
    return path.suffix.lower() in ALL_MEDIA_EXTENSIONS


def get_file_type(path: Path) -> str:
    """Get file type as string"""
    ext = path.suffix.lower()
    if ext in IMAGE_EXTENSIONS:
        return "image"
    elif ext in VIDEO_EXTENSIONS:
        return "video"
    return "unknown"
