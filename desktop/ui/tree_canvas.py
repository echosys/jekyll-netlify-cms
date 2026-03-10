"""
tree_canvas.py — QGraphicsView/Scene: NodeCard items, clickable EdgeItems, undo/redo.
"""
from __future__ import annotations

import copy
import math
from typing import Optional

from PyQt6.QtCore import Qt, QPointF, pyqtSignal
from PyQt6.QtGui import (
    QPainter, QPen, QColor, QPainterPath, QFont, QKeySequence, QShortcut,
)
from PyQt6.QtWidgets import (
    QGraphicsScene, QGraphicsView, QGraphicsPathItem,
    QGraphicsSimpleTextItem, QMenu, QInputDialog,
)

from models.tree_model import Tree, Node, Edge, new_id
from ui.node_card import NodeCard, CARD_W, CARD_H

EDGE_LABEL_COLOR  = QColor("#455A64")
EDGE_ARROW_SIZE   = 10
EDGE_HIT_WIDTH    = 14

# ── Per-relationship-type colours ────────────────────────────────────────────
_REL_COLORS = {
    "parent":  (QColor("#1565C0"), QColor("#42A5F5")),   # normal, hover
    "spouse":  (QColor("#AD1457"), QColor("#F06292")),
    "sibling": (QColor("#2E7D32"), QColor("#66BB6A")),
    "other":   (QColor("#6D4C41"), QColor("#A1887F")),
}
_REL_LABEL_COLORS = {
    "parent":  QColor("#1565C0"),
    "spouse":  QColor("#AD1457"),
    "sibling": QColor("#2E7D32"),
    "other":   QColor("#6D4C41"),
}
_REL_DASH = {          # dash pattern for normal pen ([] = solid)
    "parent":  [],
    "spouse":  [6.0, 3.0],
    "sibling": [3.0, 3.0],
    "other":   [2.0, 4.0],
}

def _make_pen(rel: str, hover: bool, width: float) -> QPen:
    colors = _REL_COLORS.get(rel, _REL_COLORS["other"])
    pen = QPen(colors[1] if hover else colors[0], width)
    pen.setCapStyle(Qt.PenCapStyle.RoundCap)
    dash = _REL_DASH.get(rel, [])
    if dash:
        pen.setDashPattern(dash)
    return pen


# ──────────────────────────────────────────────────────────────────────────────

class UndoStack:
    MAX = 50
    def __init__(self):
        self._undo: list[dict] = []
        self._redo: list[dict] = []

    def push(self, snap: dict):
        self._undo.append(snap)
        if len(self._undo) > self.MAX:
            self._undo.pop(0)
        self._redo.clear()

    def pop_undo(self) -> Optional[dict]:
        return self._undo.pop() if self._undo else None

    def pop_redo(self) -> Optional[dict]:
        return self._redo.pop() if self._redo else None

    def push_redo(self, snap: dict):  self._redo.append(snap)
    def push_undo_raw(self, snap: dict): self._undo.append(snap)
    def can_undo(self) -> bool: return bool(self._undo)
    def can_redo(self) -> bool: return bool(self._redo)


class EdgeItem(QGraphicsPathItem):
    """Directed curved arrow with label — colour/dash coded by relationship type."""

    def __init__(self, edge: Edge, src: NodeCard, dst: NodeCard, label_offset: float = 0.0):
        super().__init__()
        self.edge = edge
        self.src  = src
        self.dst  = dst
        self._label_offset = label_offset   # perpendicular px offset to avoid overlap
        rel = edge.relationship
        self._pen_n = _make_pen(rel, False, 1.5)
        self._pen_h = _make_pen(rel, True,  2.5)
        self.setPen(self._pen_n)
        self.setZValue(-1)
        self.setFlag(QGraphicsPathItem.GraphicsItemFlag.ItemIsSelectable, True)
        self.setAcceptHoverEvents(True)
        self._label = QGraphicsSimpleTextItem(edge.label or edge.relationship)
        self._label.setBrush(_REL_LABEL_COLORS.get(rel, EDGE_LABEL_COLOR))
        self._label.setFont(QFont("Arial", 8))
        self._label.setZValue(2)
        self._label.setFlag(QGraphicsSimpleTextItem.GraphicsItemFlag.ItemIsSelectable, False)
        self._label.setAcceptedMouseButtons(Qt.MouseButton.NoButton)
        self._label.setAcceptHoverEvents(False)
        self.update_path()

    def add_to_scene(self, scene):
        scene.addItem(self)
        scene.addItem(self._label)

    def remove_from_scene(self, scene):
        if self.scene(): scene.removeItem(self)
        if self._label.scene(): scene.removeItem(self._label)

    def update_path(self):
        sr = self.src.boundingRect()
        dr = self.dst.boundingRect()
        # Use card centers for control point calculations
        sp_c = self.src.pos() + QPointF(sr.width()/2, sr.height()/2)
        dp_c = self.dst.pos() + QPointF(dr.width()/2, dr.height()/2)

        # Start point: exit edge of source card
        sp = self._card_edge_point(sp_c, dp_c, self.src.pos(), sr)
        # End point: entry edge of destination card (arrow tip lands here)
        dp = self._card_edge_point(dp_c, sp_c, self.dst.pos(), dr)

        c1 = QPointF(sp.x(), (sp.y()+dp.y())/2)
        c2 = QPointF(dp.x(), (sp.y()+dp.y())/2)
        path = QPainterPath()
        path.moveTo(sp)
        path.cubicTo(c1, c2, dp)

        # Arrowhead at dp, pointing along tangent from c2 to dp
        dx = dp.x()-c2.x(); dy = dp.y()-c2.y()
        ln = math.hypot(dx, dy) or 1
        ux, uy = dx/ln, dy/ln
        S = EDGE_ARROW_SIZE
        left  = QPointF(dp.x()-S*ux+S*0.4*(-uy), dp.y()-S*uy+S*0.4*ux)
        right = QPointF(dp.x()-S*ux-S*0.4*(-uy), dp.y()-S*uy-S*0.4*ux)
        path.moveTo(dp); path.lineTo(left)
        path.moveTo(dp); path.lineTo(right)
        self.setPath(path)

        # Label: midpoint of bezier + perpendicular offset
        mid = self._bp(sp, c1, c2, dp, 0.5)
        t1  = self._bp(sp, c1, c2, dp, 0.48)
        t2  = self._bp(sp, c1, c2, dp, 0.52)
        tx = t2.x()-t1.x(); ty = t2.y()-t1.y()
        tl = math.hypot(tx, ty) or 1
        nx, ny = -ty/tl, tx/tl
        off = self._label_offset
        br = self._label.boundingRect()
        self._label.setPos(mid.x() - br.width()/2 + nx*off,
                           mid.y() - br.height()/2 - 10 + ny*off)

    @staticmethod
    def _card_edge_point(from_c: QPointF, to_c: QPointF,
                         card_pos: QPointF, card_rect) -> QPointF:
        """Return the point where the line from→to exits the card rectangle."""
        dx = to_c.x() - from_c.x()
        dy = to_c.y() - from_c.y()
        if dx == 0 and dy == 0:
            return from_c
        # Card rectangle in scene coords
        rx = card_pos.x();  ry = card_pos.y()
        rw = card_rect.width(); rh = card_rect.height()
        cx = rx + rw/2;  cy = ry + rh/2

        # Parametric: P(t) = from_c + t*(to_c-from_c)
        # Find smallest t>0 that hits any of the 4 edges
        best_t = 1.0
        half_w = rw/2; half_h = rh/2

        for edge_x, edge_y in [
            (cx - half_w, None), (cx + half_w, None),   # vertical edges (x fixed)
            (None, cy - half_h), (None, cy + half_h),   # horizontal edges (y fixed)
        ]:
            if edge_x is not None and dx != 0:
                t = (edge_x - from_c.x()) / dx
                y_at_t = from_c.y() + t * dy
                if 0 < t <= best_t and cy - half_h <= y_at_t <= cy + half_h:
                    best_t = t
            elif edge_y is not None and dy != 0:
                t = (edge_y - from_c.y()) / dy
                x_at_t = from_c.x() + t * dx
                if 0 < t <= best_t and cx - half_w <= x_at_t <= cx + half_w:
                    best_t = t

        return QPointF(from_c.x() + best_t * dx, from_c.y() + best_t * dy)

    def shape(self) -> QPainterPath:
        from PyQt6.QtGui import QPainterPathStroker
        s = QPainterPathStroker(); s.setWidth(EDGE_HIT_WIDTH)
        return s.createStroke(self.path())

    @staticmethod
    def _bp(p0, p1, p2, p3, t):
        mt = 1-t
        return QPointF(
            mt**3*p0.x()+3*mt**2*t*p1.x()+3*mt*t**2*p2.x()+t**3*p3.x(),
            mt**3*p0.y()+3*mt**2*t*p1.y()+3*mt*t**2*p2.y()+t**3*p3.y())

    def hoverEnterEvent(self, e):
        self.setPen(self._pen_h)
        self._label.setBrush(_REL_LABEL_COLORS.get(self.edge.relationship, EDGE_LABEL_COLOR).lighter(130))
        super().hoverEnterEvent(e)

    def hoverLeaveEvent(self, e):
        self.setPen(self._pen_n)
        self._label.setBrush(_REL_LABEL_COLORS.get(self.edge.relationship, EDGE_LABEL_COLOR))
        super().hoverLeaveEvent(e)


class TreeCanvas(QGraphicsView):

    node_double_clicked = pyqtSignal(str)
    tree_modified       = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._scene = QGraphicsScene(self)
        self.setScene(self._scene)
        self.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.setDragMode(QGraphicsView.DragMode.RubberBandDrag)
        self.setTransformationAnchor(QGraphicsView.ViewportAnchor.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.ViewportAnchor.AnchorViewCenter)
        self.setBackgroundBrush(QColor("#F8F9FA"))
        self.tree: Optional[Tree] = None
        self.tree_dir: Optional[str] = None
        self._node_items: dict[str, NodeCard] = {}
        self._edge_items: list[EdgeItem] = []
        self._pan_active  = False
        self._pan_start   = QPointF()
        self._zoom_locked = False
        self._undo_stack  = UndoStack()
        QShortcut(QKeySequence.StandardKey.Undo, self, activated=self._undo)
        QShortcut(QKeySequence.StandardKey.Redo, self, activated=self._redo)

    # ── snapshot / undo / redo ────────────────────────────────────────
    def _snapshot(self):
        if self.tree:
            self._undo_stack.push(copy.deepcopy(self.tree.to_dict()))

    def _undo(self):
        if not self._undo_stack.can_undo() or not self.tree: return
        self._undo_stack.push_redo(copy.deepcopy(self.tree.to_dict()))
        self._apply_snapshot(self._undo_stack.pop_undo())

    def _redo(self):
        if not self._undo_stack.can_redo() or not self.tree: return
        self._undo_stack.push_undo_raw(copy.deepcopy(self.tree.to_dict()))
        self._apply_snapshot(self._undo_stack.pop_redo())

    def _apply_snapshot(self, snap: dict):
        from models.tree_model import Tree as T
        r = T.from_dict(snap)
        self.tree.nodes = r.nodes; self.tree.edges = r.edges; self.tree.resources = r.resources
        self._rebuild(); self.tree_modified.emit()

    # ── public ────────────────────────────────────────────────────────
    def load_tree(self, tree: Tree, tree_dir: str):
        self.tree = tree; self.tree_dir = tree_dir; self._undo_stack = UndoStack()
        self._rebuild()
        from PyQt6.QtCore import QTimer
        QTimer.singleShot(80, self.fit_view)

    def clear(self):
        self._scene.clear(); self._node_items.clear(); self._edge_items.clear()
        self.tree = None; self.tree_dir = None

    def refresh_node(self, node_id: str):
        item = self._node_items.get(node_id)
        if item: item.refresh()
        self._rebuild_edges()

    def fit_view(self):
        if not self._node_items: return
        self.fitInView(self._scene.itemsBoundingRect().adjusted(-40,-40,40,40),
                       Qt.AspectRatioMode.KeepAspectRatio)

    def set_zoom_locked(self, locked: bool):
        self._zoom_locked = locked

    def auto_layout(self):
        """Hierarchical auto-layout matching the natural hand-crafted style.

        Key design choices (matching the sample tree's feel):
        - Large horizontal spacing so edge labels never crowd each other
        - Children spread proportionally under their parents (not uniformly)
        - Spouse pairs kept adjacent
        - Disconnected nodes placed in a row above everything else
        - Small alternating vertical nudge on sibling rows prevents labels
          from all sitting at exactly the same height
        """
        if not self.tree or not self.tree.nodes:
            return
        self._snapshot()

        H_GAP  = CARD_W  + 80    # 250px between card left edges
        V_GAP  = CARD_H  + 120   # 190px between generation rows
        NUDGE  = 18               # alternating vertical nudge per column

        nodes  = self.tree.nodes
        nids   = {n.id for n in nodes}

        # ── 1. Build parent/child maps ────────────────────────────────
        children_of: dict[str, list[str]] = {n.id: [] for n in nodes}
        parents_of:  dict[str, list[str]] = {n.id: [] for n in nodes}
        spouse_set:  dict[str, str]       = {}

        for e in self.tree.edges:
            if e.source not in nids or e.target not in nids:
                continue
            if e.relationship == "parent":
                children_of[e.source].append(e.target)
                parents_of[e.target].append(e.source)
            elif e.relationship == "spouse":
                spouse_set[e.source] = e.target
                spouse_set[e.target] = e.source

        # ── 2. Generation assignment via BFS ─────────────────────────
        generation: dict[str, int] = {}
        roots = [n.id for n in nodes if not parents_of[n.id]]
        if not roots:
            roots = [nodes[0].id]
        queue = list(roots)
        for r in roots:
            generation[r] = 0
        while queue:
            nxt = []
            for nid in queue:
                for child in children_of[nid]:
                    g = generation[nid] + 1
                    if child not in generation or generation[child] < g:
                        generation[child] = g
                        nxt.append(child)
            queue = nxt
        max_gen = max(generation.values(), default=0)
        for n in nodes:
            if n.id not in generation:
                generation[n.id] = max_gen + 1   # disconnected → bottom row

        # ── 3. Bucket by generation ───────────────────────────────────
        from collections import defaultdict
        gen_buckets: dict[int, list[str]] = defaultdict(list)
        for nid, g in generation.items():
            gen_buckets[g].append(nid)

        # ── 4. Within each generation: barycentric order + spouse grouping ──
        node_col: dict[str, float] = {}   # fractional column position
        for g in sorted(gen_buckets):
            bucket = gen_buckets[g]

            # Barycentric sort by parents' average column
            def bary(nid: str) -> float:
                ps = parents_of[nid]
                if not ps:
                    return node_col.get(nid, 0.0)
                return sum(node_col.get(p, 0.0) for p in ps) / len(ps)
            bucket.sort(key=bary)

            # Pull spouse pairs together
            visited: set[str] = set()
            ordered: list[str] = []
            for nid in bucket:
                if nid in visited:
                    continue
                ordered.append(nid); visited.add(nid)
                sp = spouse_set.get(nid)
                if sp and sp in bucket and sp not in visited:
                    ordered.append(sp); visited.add(sp)
            gen_buckets[g] = ordered
            for i, nid in enumerate(ordered):
                node_col[nid] = float(i)

        # ── 5. Compute subtree widths for natural spreading ───────────
        # subtree_width = max(1, number of leaf descendants)
        subtree_w: dict[str, float] = {}

        def calc_width(nid: str) -> float:
            if nid in subtree_w:
                return subtree_w[nid]
            ch = children_of[nid]
            if not ch:
                subtree_w[nid] = 1.0
            else:
                subtree_w[nid] = sum(calc_width(c) for c in ch)
            return subtree_w[nid]

        for r in roots:
            calc_width(r)
        for n in nodes:
            if n.id not in subtree_w:
                subtree_w[n.id] = 1.0

        # ── 6. Assign x positions: spread children proportionally ─────
        x_pos: dict[str, float] = {}

        def place(nid: str, left: float):
            """Place nid and its descendants starting from x=left."""
            w = subtree_w[nid] * H_GAP
            x_pos[nid] = left + w / 2 - CARD_W / 2   # centre the card in its slot

            ch = children_of[nid]
            if not ch:
                return
            # Distribute children proportionally by their subtree width
            cursor = left
            for c in gen_buckets.get(generation[nid] + 1, []):
                if c not in ch:
                    continue
                cw = subtree_w[c] * H_GAP
                place(c, cursor)
                cursor += cw

        # Place each root tree; separate multiple root trees by a gap
        cursor = 0.0
        for r in roots:
            place(r, cursor)
            cursor += subtree_w[r] * H_GAP + H_GAP  # gap between separate trees

        # Nodes not placed via tree (disconnected / spouse-only)
        unplaced = [n.id for n in nodes if n.id not in x_pos]
        if unplaced:
            # Place them in a row at the top (generation = max_gen+1 already set)
            for i, nid in enumerate(unplaced):
                x_pos[nid] = cursor + i * H_GAP

        # ── 7. Apply positions ────────────────────────────────────────
        for n in nodes:
            g = generation[n.id]
            x = x_pos.get(n.id, 0.0)
            # Alternating nudge: even columns slightly higher, odd slightly lower
            col_idx = int(round(node_col.get(n.id, 0)))
            y = g * V_GAP + (col_idx % 2) * NUDGE
            n.position.x = x
            n.position.y = y
            card = self._node_items.get(n.id)
            if card:
                card.setPos(x, y)

        self._rebuild_edges()
        self.tree_modified.emit()
        from PyQt6.QtCore import QTimer
        QTimer.singleShot(50, self.fit_view)

    # ── build ─────────────────────────────────────────────────────────
    def _rebuild(self):
        self._scene.clear(); self._node_items.clear(); self._edge_items.clear()
        if not self.tree: return
        for node in self.tree.nodes:
            card = NodeCard(node, self.tree_dir or "")
            self._scene.addItem(card)
            self._node_items[node.id] = card
        self._rebuild_edges()

    def _rebuild_edges(self):
        for ei in self._edge_items:
            ei.remove_from_scene(self._scene)
        self._edge_items.clear()
        if not self.tree:
            return

        # Count how many edges share the same (src,dst) or (dst,src) pair
        # so we can stagger their labels perpendicularly
        pair_count: dict[tuple[str,str], int] = {}
        pair_index: dict[int, int] = {}   # edge list index → offset index
        for i, edge in enumerate(self.tree.edges):
            key = tuple(sorted([edge.source, edge.target]))
            pair_count[key] = pair_count.get(key, 0) + 1

        pair_seen: dict[tuple[str,str], int] = {}
        for i, edge in enumerate(self.tree.edges):
            src = self._node_items.get(edge.source)
            dst = self._node_items.get(edge.target)
            if not src or not dst:
                continue
            key = tuple(sorted([edge.source, edge.target]))
            idx = pair_seen.get(key, 0)
            pair_seen[key] = idx + 1
            count = pair_count[key]
            # Spread labels: first edge offset 0, second +16, third -16, etc.
            if count == 1:
                offset = 0.0
            else:
                offset = (idx - (count - 1) / 2.0) * 18.0
            ei = EdgeItem(edge, src, dst, label_offset=offset)
            ei.add_to_scene(self._scene)
            self._edge_items.append(ei)

    # ── interaction ───────────────────────────────────────────────────
    def mouseDoubleClickEvent(self, event):
        item = self.itemAt(event.pos())
        edge_item: Optional[EdgeItem] = None
        node_item: Optional[NodeCard] = None
        c = item
        while c:
            if isinstance(c, EdgeItem): edge_item = c; break
            if isinstance(c, NodeCard): node_item = c; break
            c = c.parentItem()
        if edge_item is None and node_item is None:
            scene_pos = self.mapToScene(event.pos())
            for ei in self._edge_items:
                if ei.shape().contains(ei.mapFromScene(scene_pos)):
                    edge_item = ei
                    break
        if edge_item:
            self._show_edge_menu(edge_item, event.globalPosition().toPoint())
        elif node_item:
            self.node_double_clicked.emit(node_item.node.id)
        else:
            super().mouseDoubleClickEvent(event)

    def contextMenuEvent(self, event):
        raw = self.itemAt(event.pos())
        edge_item: Optional[EdgeItem] = None
        node_item: Optional[NodeCard] = None
        c = raw
        while c:
            if isinstance(c, EdgeItem): edge_item = c; break
            if isinstance(c, NodeCard): node_item = c; break
            c = c.parentItem()
        if edge_item is None and node_item is None:
            scene_pos = self.mapToScene(event.pos())
            for ei in self._edge_items:
                if ei.shape().contains(ei.mapFromScene(scene_pos)):
                    edge_item = ei
                    break

        menu = QMenu(self)

        if edge_item:
            self._show_edge_menu(edge_item, event.globalPos())
        elif node_item:
            open_act = menu.addAction("Open Person Detail")
            rel_menu = menu.addMenu("Add Relationship")
            for lbl in ("Parent of", "Child of", "Spouse", "Sibling"):
                rel_menu.addAction(lbl)
            menu.addSeparator()
            del_act = menu.addAction("Delete Node")
            chosen = menu.exec(event.globalPos())
            if chosen == open_act:
                self.node_double_clicked.emit(node_item.node.id)
            elif chosen == del_act:
                self._delete_node(node_item)
            elif chosen and chosen.text() in ("Parent of", "Child of", "Spouse", "Sibling"):
                self._start_add_edge(node_item, chosen.text())
        else:
            add_act = menu.addAction("Add Person Here")
            fit_act = menu.addAction("Fit All Nodes")
            layout_act = menu.addAction("⊞  Auto Layout")
            chosen = menu.exec(event.globalPos())
            if chosen == add_act:   self._add_node(self.mapToScene(event.pos()))
            elif chosen == fit_act: self.fit_view()
            elif chosen == layout_act: self.auto_layout()

    # ── edge ops ──────────────────────────────────────────────────────
    def _delete_edge(self, ei: EdgeItem):
        if not self.tree: return
        self._snapshot()
        self.tree.edges = [e for e in self.tree.edges if e.id != ei.edge.id]
        self._rebuild_edges(); self.tree_modified.emit()

    def _show_edge_menu(self, ei: EdgeItem, global_pos):
        if not self.tree: return
        sn = self.tree.get_node(ei.edge.source)
        dn = self.tree.get_node(ei.edge.target)
        menu = QMenu(self)
        h = menu.addAction(f"  {sn.name if sn else '?'}  →  {dn.name if dn else '?'}")
        h.setEnabled(False)
        # Show relationship type with colour hint
        rel = ei.edge.relationship
        rel_indicator = {"parent": "🔵", "spouse": "🔴", "sibling": "🟢"}.get(rel, "⚫")
        type_h = menu.addAction(f"  {rel_indicator}  {ei.edge.label or rel}")
        type_h.setEnabled(False)
        menu.addSeparator()
        edit_act   = menu.addAction("✏  Change Relationship…")
        delete_act = menu.addAction("🗑  Delete Relationship")
        chosen = menu.exec(global_pos)
        if chosen == delete_act:
            self._delete_edge(ei)
        elif chosen == edit_act:
            self._edit_edge_relationship(ei)

    def _edit_edge_relationship(self, ei: EdgeItem):
        if not self.tree: return
        options = ["Parent of", "Child of", "Spouse", "Sibling"]
        current = ei.edge.relationship
        pre = {"parent": 0, "spouse": 2, "sibling": 3}.get(current, 0)
        choice, ok = QInputDialog.getItem(
            self, "Change Relationship",
            "Choose the new relationship type\n(label is set automatically from gender):",
            options, pre, False,
        )
        if not ok: return
        src_node = self.tree.get_node(ei.edge.source)
        dst_node = self.tree.get_node(ei.edge.target)
        if not src_node or not dst_node: return
        self._snapshot()
        if choice == "Parent of":
            ei.edge.relationship = "parent"
            ei.edge.label = src_node.parent_label()
        elif choice == "Child of":
            ei.edge.source, ei.edge.target = ei.edge.target, ei.edge.source
            new_src = self.tree.get_node(ei.edge.source)
            ei.edge.relationship = "parent"
            ei.edge.label = new_src.parent_label() if new_src else "Parent of"
        elif choice == "Spouse":
            ei.edge.relationship = "spouse"
            ei.edge.label = "Spouse"
        elif choice == "Sibling":
            ei.edge.relationship = "sibling"
            ei.edge.label = "Sibling"
        self._rebuild_edges()
        self.tree_modified.emit()

    # ── node ops ──────────────────────────────────────────────────────
    def _add_node(self, pos: QPointF):
        if not self.tree: return
        name, ok = QInputDialog.getText(self, "Add Person", "Name:")
        if not ok or not name.strip(): return
        birth, _ = QInputDialog.getText(self, "Birth Date", "Birth date (YYYY-MM-DD, optional):")
        self._snapshot()
        node = Node(name=name.strip(), birth_date=birth.strip() or None)
        node.position.x = pos.x(); node.position.y = pos.y()
        self.tree.nodes.append(node)
        card = NodeCard(node, self.tree_dir or "")
        self._scene.addItem(card); self._node_items[node.id] = card
        self._heal_orphan_tags(node)
        self.tree_modified.emit()

    def _delete_node(self, card: NodeCard):
        if not self.tree: return
        nid  = card.node.id
        name = card.node.name
        tag_count = sum(
            sum(1 for r in res.regions if r.node_id == nid) + (1 if nid in res.tags.persons else 0)
            for res in self.tree.resources
        )
        from PyQt6.QtWidgets import QMessageBox
        msg = f"Delete <b>{name}</b>?"
        if tag_count:
            msg += (f"<br><br><b>Warning:</b> This person is tagged in "
                    f"<b>{tag_count}</b> photo region(s).<br>"
                    f"Tags will become unlinked but are <i>not deleted</i>.")
        box = QMessageBox(self)
        box.setWindowTitle("Delete Person")
        box.setTextFormat(Qt.TextFormat.RichText)
        box.setText(msg)
        box.setStandardButtons(QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.Cancel)
        box.setDefaultButton(QMessageBox.StandardButton.Cancel)
        box.button(QMessageBox.StandardButton.Yes).setText("Delete")
        if box.exec() != QMessageBox.StandardButton.Yes:
            return
        self._snapshot()
        marker = f"__orphan__:{name}"
        for res in self.tree.resources:
            for reg in res.regions:
                if reg.node_id == nid:
                    reg.node_id = marker
            if nid in res.tags.persons:
                res.tags.persons.remove(nid)
                if marker not in res.tags.persons:
                    res.tags.persons.append(marker)
        self.tree.nodes = [n for n in self.tree.nodes if n.id != nid]
        self.tree.edges = [e for e in self.tree.edges if e.source != nid and e.target != nid]
        self._rebuild(); self.tree_modified.emit()

    def _heal_orphan_tags(self, node: Node):
        if not self.tree: return
        marker = f"__orphan__:{node.name}"
        healed = 0
        for res in self.tree.resources:
            for reg in res.regions:
                if reg.node_id == marker:
                    reg.node_id = node.id; healed += 1
            if marker in res.tags.persons:
                res.tags.persons.remove(marker)
                if node.id not in res.tags.persons:
                    res.tags.persons.append(node.id)
                healed += 1
        if healed:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.information(self, "Tags Restored",
                f"Restored {healed} photo tag(s) for \"{node.name}\".")

    def _start_add_edge(self, src_card: NodeCard, rel_label: str):
        if not self.tree: return
        names = [n.name for n in self.tree.nodes if n.id != src_card.node.id]
        if not names: return
        prompt = {
            "Parent of": "Parent of whom?",
            "Child of":  "Child of whom? (select the parent)",
            "Spouse":    "Spouse of whom?",
            "Sibling":   "Sibling of whom?",
        }.get(rel_label, f"'{rel_label}' whom?")
        name, ok = QInputDialog.getItem(self, "Select Person", prompt, names, 0, False)
        if not ok: return
        other = next((n for n in self.tree.nodes if n.name == name), None)
        if not other: return
        self._snapshot()
        if rel_label == "Parent of":
            edge = Edge(source=src_card.node.id, target=other.id,
                        relationship="parent", label=src_card.node.parent_label())
        elif rel_label == "Child of":
            edge = Edge(source=other.id, target=src_card.node.id,
                        relationship="parent", label=other.parent_label())
        else:
            edge = Edge(source=src_card.node.id, target=other.id,
                        relationship=rel_label.lower(), label=rel_label)
        self.tree.edges.append(edge)
        self._rebuild_edges(); self.tree_modified.emit()

    # ── pan & zoom ────────────────────────────────────────────────────
    def wheelEvent(self, event):
        if self._zoom_locked: return
        f = 1.15 if event.angleDelta().y() > 0 else 1/1.15
        self.scale(f, f)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.MiddleButton:
            self._pan_active = True; self._pan_start = event.pos()
            self.setCursor(Qt.CursorShape.ClosedHandCursor)
        else:
            super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._pan_active:
            delta = event.pos()-self._pan_start; self._pan_start = event.pos()
            self.horizontalScrollBar().setValue(self.horizontalScrollBar().value()-int(delta.x()))
            self.verticalScrollBar().setValue(self.verticalScrollBar().value()-int(delta.y()))
        else:
            super().mouseMoveEvent(event)
        for ei in self._edge_items: ei.update_path()

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.MiddleButton:
            self._pan_active = False; self.setCursor(Qt.CursorShape.ArrowCursor)
        else:
            super().mouseReleaseEvent(event)
        for ei in self._edge_items: ei.update_path()
        if self.tree: self.tree_modified.emit()
