"""
node_card.py — Custom QGraphicsItem that renders a person card on the tree canvas.
Gender-coded background colours:
  Male    → pale blue  #E3F2FD / border #90CAF9
  Female  → pale rose  #FCE4EC / border #F48FB1
  Other   → pale green #F1F8E9 / border #AED581
  Unknown → light grey #FAFAFA / border #9E9E9E
"""
from __future__ import annotations

import os
from typing import Optional, TYPE_CHECKING

from PyQt6.QtCore import QRectF, Qt, QPointF
from PyQt6.QtGui import (
    QPainter, QPen, QBrush, QColor, QFont, QPixmap, QPainterPath, QFontMetrics,
)
from PyQt6.QtWidgets import QGraphicsItem, QStyleOptionGraphicsItem, QWidget

if TYPE_CHECKING:
    from models.tree_model import Node

CARD_W     = 170
CARD_H     = 72
THUMB_SIZE = 50
THUMB_MARGIN = 10
CORNER_R   = 8

COLOR_SELECTED  = QColor("#1565C0")
COLOR_STANDALONE_BORDER = QColor("#E65100")
COLOR_NAME  = QColor("#212121")
COLOR_YEARS = QColor("#757575")

# gender → (background, border)
GENDER_COLORS = {
    "male":    (QColor("#E3F2FD"), QColor("#90CAF9")),
    "female":  (QColor("#FCE4EC"), QColor("#F48FB1")),
    "other":   (QColor("#F1F8E9"), QColor("#AED581")),
    "unknown": (QColor("#FAFAFA"), QColor("#BDBDBD")),
}


def _gender_colors(node: "Node") -> tuple[QColor, QColor]:
    return GENDER_COLORS.get(node.gender, GENDER_COLORS["unknown"])


class NodeCard(QGraphicsItem):
    """Visual card representing one person node on the canvas."""

    def __init__(self, node: "Node", resources_dir: str, parent=None):
        super().__init__(parent)
        self.node = node
        self.resources_dir = resources_dir
        self._pixmap: Optional[QPixmap] = None

        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable, True)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable, True)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemSendsGeometryChanges, True)
        self.setCacheMode(QGraphicsItem.CacheMode.DeviceCoordinateCache)

        self.setPos(node.position.x, node.position.y)
        self._load_thumb()

    def _load_thumb(self):
        self._pixmap = None
        ref = self.node.profile_image_ref
        if ref:
            # ref is stored as "resources/filename.jpg" — join directly onto tree_dir
            full = os.path.join(self.resources_dir, ref)
            if os.path.exists(full):
                pix = QPixmap(full)
                if not pix.isNull():
                    self._pixmap = pix.scaled(
                        THUMB_SIZE, THUMB_SIZE,
                        Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                        Qt.TransformationMode.SmoothTransformation,
                    )

    def refresh(self):
        self._load_thumb()
        self.update()

    def boundingRect(self) -> QRectF:
        return QRectF(0, 0, CARD_W, CARD_H)

    def shape(self) -> QPainterPath:
        path = QPainterPath()
        path.addRoundedRect(self.boundingRect(), CORNER_R, CORNER_R)
        return path

    def paint(self, painter: QPainter, option: QStyleOptionGraphicsItem,
              widget: Optional[QWidget] = None):
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        rect = self.boundingRect()

        bg_color, border_color = _gender_colors(self.node)

        if self.isSelected():
            border_color = COLOR_SELECTED
        elif self.node.is_standalone:
            border_color = COLOR_STANDALONE_BORDER

        # card background
        painter.setBrush(QBrush(bg_color))
        painter.setPen(QPen(border_color, 2 if self.isSelected() else 1.5))
        path = QPainterPath()
        path.addRoundedRect(rect, CORNER_R, CORNER_R)
        painter.drawPath(path)

        # thumbnail circle
        thumb_x = THUMB_MARGIN
        thumb_y = (CARD_H - THUMB_SIZE) / 2
        thumb_rect = QRectF(thumb_x, thumb_y, THUMB_SIZE, THUMB_SIZE)

        clip = QPainterPath()
        clip.addEllipse(thumb_rect)
        painter.save()
        painter.setClipPath(clip)
        if self._pixmap:
            painter.drawPixmap(int(thumb_rect.x()), int(thumb_rect.y()), self._pixmap)
        else:
            painter.setBrush(QBrush(border_color.lighter(130)))
            painter.setPen(Qt.PenStyle.NoPen)
            painter.drawEllipse(thumb_rect)
            # silhouette
            cx, cy = thumb_rect.center().x(), thumb_rect.center().y()
            head_r = THUMB_SIZE * 0.18
            painter.setBrush(QBrush(border_color.darker(110)))
            painter.drawEllipse(QPointF(cx, cy - head_r * 0.6), head_r, head_r)
        painter.restore()

        # circle border
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.setPen(QPen(border_color.darker(120), 1.5))
        painter.drawEllipse(thumb_rect)

        # name label
        text_x = thumb_x + THUMB_SIZE + 8
        text_w = CARD_W - text_x - 6
        name_font = QFont("Arial", 10, QFont.Weight.Bold)
        painter.setFont(name_font)
        painter.setPen(COLOR_NAME)
        fm = QFontMetrics(name_font)
        name_text = fm.elidedText(self.node.name, Qt.TextElideMode.ElideRight, int(text_w))
        painter.drawText(QRectF(text_x, 10, text_w, 24),
                         Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter, name_text)

        # years label
        years_font = QFont("Arial", 8)
        painter.setFont(years_font)
        painter.setPen(COLOR_YEARS)
        painter.drawText(QRectF(text_x, 38, text_w, 18),
                         Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                         self.node.years_label())

    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionHasChanged:
            self.node.position.x = self.pos().x()
            self.node.position.y = self.pos().y()
        return super().itemChange(change, value)

