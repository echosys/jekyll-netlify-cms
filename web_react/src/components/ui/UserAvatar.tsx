/**
 * UserAvatar.tsx — Top-right user avatar circle with popover.
 * Shows the user's initial in their color. Click to show full name,
 * role badge, and other currently online users.
 */
import { useState, useRef, useEffect } from 'react';
import type { UserDoc } from '../../store/authStore';

interface Props {
  user: UserDoc;
  onlineUsers: UserDoc[];
  onLogout: () => void;
}

function InitialCircle({ user, size = 32 }: { user: UserDoc; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: user.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 700,
        fontSize: size * 0.4,
        flexShrink: 0,
        userSelect: 'none',
      }}
      title={user.username}
    >
      {user.username[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

export default function UserAvatar({ user, onlineUsers, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Other online users (exclude self)
  const others = onlineUsers.filter((u) => u.username !== user.username);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
        title="Your account"
      >
        <InitialCircle user={user} size={32} />
        {others.length > 0 && (
          <span
            style={{
              fontSize: 11,
              color: '#555',
              background: '#f0f0f0',
              borderRadius: 10,
              padding: '1px 6px',
              fontWeight: 600,
            }}
          >
            +{others.length}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 40,
            right: 0,
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            padding: '14px 16px',
            minWidth: 210,
            zIndex: 1000,
          }}
        >
          {/* Self */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <InitialCircle user={user} size={36} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#222' }}>{user.username}</div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  marginTop: 2,
                  color: user.role === 'dev' ? '#1565C0' : '#2E7D32',
                  background: user.role === 'dev' ? '#E3F2FD' : '#E8F5E9',
                  display: 'inline-block',
                  borderRadius: 4,
                  padding: '1px 6px',
                }}
              >
                {user.role.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Online users */}
          {others.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: '#999', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Also online ({others.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {others.map((u) => (
                  <div key={u.username} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <InitialCircle user={u} size={26} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{u.username}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{u.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {others.length === 0 && (
            <div style={{ fontSize: 12, color: '#bbb', marginBottom: 12 }}>No other users online</div>
          )}

          <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '8px 0' }} />
          <button
            onClick={onLogout}
            style={{
              width: '100%',
              padding: '7px 0',
              border: 'none',
              background: '#fafafa',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              color: '#c62828',
              fontWeight: 600,
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

