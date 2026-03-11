/**
 * SyncStatusPill.tsx — Color-coded sync status indicator.
 *
 *   1 = grey   — not synced (LOCAL mode)
 *   2 = blue   — reading from DB (pulse)
 *   3 = yellow — synced-default idle  (or "Changed" if isDirty)
 *   4 = orange — writing to DB (pulse)
 *   5 = green  — locked + synced idle
 */
import type { SyncStatus } from '../../store/lockStore';

const STATUS_CONFIG: Record<SyncStatus, { dot: string; bg: string; border: string; text: string; label: string }> = {
  1: { dot: '#bdbdbd', bg: '#f5f5f5',  border: '#e0e0e0', text: '#9e9e9e', label: 'Not synced'  },
  2: { dot: '#1E88E5', bg: '#E3F2FD',  border: '#90CAF9', text: '#1565C0', label: 'Reading…'    },
  3: { dot: '#F9A825', bg: '#FFFDE7',  border: '#FFF176', text: '#F57F17', label: 'Synced'       },
  4: { dot: '#FB8C00', bg: '#FFF3E0',  border: '#FFCC80', text: '#E65100', label: 'Writing…'     },
  5: { dot: '#43A047', bg: '#E8F5E9',  border: '#A5D6A7', text: '#2E7D32', label: 'Synced'       },
};

interface Props {
  status: SyncStatus;
  isDirty?: boolean;        // shows "Changed" instead of "Synced" for status 3
  lastSyncAt?: number;      // timestamp of last successful read/write
  onClick?: () => void;
  title?: string;
}

export default function SyncStatusPill({ status, isDirty, lastSyncAt, onClick, title }: Props) {
  const cfg = STATUS_CONFIG[status];
  const pulse = status === 2 || status === 4;

  const timeStr = lastSyncAt && lastSyncAt > 0
    ? new Date(lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  // Label logic
  let label = cfg.label;
  if (status === 3 && isDirty) label = 'Changed';
  const timeLabel = (status === 3 || status === 5) && timeStr ? ` · ${timeStr}` : '';

  return (
    <button
      onClick={onClick}
      title={title ?? label}
      className="pill"
      style={{
        border: `1px solid ${cfg.border}`,
        background: cfg.bg,
        cursor: onClick ? 'pointer' : 'default',
        color: cfg.text,
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: cfg.dot,
        display: 'inline-block', flexShrink: 0,
        animation: pulse ? 'syncPulse 1s infinite' : 'none',
      }} />
      {label}{timeLabel}
    </button>
  );
}
