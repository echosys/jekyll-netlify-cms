/**
 * useKeyboardShortcuts.ts — Global keyboard shortcut handler.
 */
import { useEffect } from 'react';
import { useTreeStore } from '../store/treeStore';

interface Options {
  onSave: () => void;
  onFitView: () => void;
  onAutoLayout: () => void;
}

export function useKeyboardShortcuts({ onSave, onFitView, onAutoLayout }: Options) {
  const undo = useTreeStore((s) => s.undo);
  const redo = useTreeStore((s) => s.redo);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          onSave();
          break;
        case 'z':
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          break;
        case 'y':
          e.preventDefault();
          redo();
          break;
        case '0':
          e.preventDefault();
          onFitView();
          break;
        case 'l':
          e.preventDefault();
          onAutoLayout();
          break;
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSave, onFitView, onAutoLayout, undo, redo]);
}

