import React from 'react';

/**
 * LockButton.tsx — Request / release the write lock.
 *
 * States:
 *   I hold lock          → "Release Lock · Ns" countdown
 *   No lock held         → "Request Lock"
 *   Someone else holds   → disabled chip showing holder (banner shown by parent)
 *   Dev + someone holds  → "⚡ Force Take"
 *   LOCAL mode           → hidden (parent doesn't render this)
 */

interface Props {
  treeState: 'SYNCED_DEFAULT' | 'SYNCED_LOCKED';
  lockHolder: string | null;
  lockCountdown: number;
  myUsername: string;
  myRole: 'dev' | 'user';
  onAcquire: () => void;
  onRelease: () => void;
  onForceTake: () => void;
}

const BASE: React.CSSProperties = {
  padding: '4px 12px',
  borderRadius: 20,
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
  border: '1px solid',
};

export default function LockButton({
  treeState,
  lockHolder,
  lockCountdown,
  myUsername,
  myRole,
  onAcquire,
  onRelease,
  onForceTake,
}: Props) {
  const iHoldLock = treeState === 'SYNCED_LOCKED' && lockHolder === myUsername;
  const someoneElseHolds = lockHolder !== null && lockHolder !== myUsername;

  if (iHoldLock) {
    return (
      <button
        onClick={onRelease}
        title="Release the write lock"
        style={{
          ...BASE,
          borderColor: 'rgba(168,85,247,0.35)',
          background: 'rgba(243,232,255,0.7)',
          color: '#7e22ce',
          backdropFilter: 'blur(8px)',
        }}
      >
        🔓 Release Lock · {lockCountdown}s
      </button>
    );
  }

  if (someoneElseHolds) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span
          style={{
            ...BASE,
            cursor: 'default',
            borderColor: '#e0e0e0',
            background: '#f5f5f5',
            color: '#bbb',
            display: 'inline-block',
          }}
        >
          🔒 {lockHolder}
        </span>
        {myRole === 'dev' && (
          <button
            onClick={onForceTake}
            title={`Force-take lock from ${lockHolder}`}
            style={{
              ...BASE,
              borderColor: 'rgba(168,85,247,0.4)',
              background: 'rgba(243,232,255,0.65)',
              color: '#7e22ce',
              backdropFilter: 'blur(8px)',
            }}
          >
            ⚡ Force Take
          </button>
        )}
      </div>
    );
  }

  // No one holds the lock
  return (
    <button
      onClick={onAcquire}
      title="Request write lock to save changes to DB"
      style={{
        ...BASE,
        borderColor: 'rgba(168,85,247,0.35)',
        background: 'rgba(243,232,255,0.55)',
        color: '#9333ea',
        backdropFilter: 'blur(8px)',
        transition: 'background 0.2s, box-shadow 0.2s',
      }}
    >
      🔒 Request Lock
    </button>
  );
}
