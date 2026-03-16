/**
 * LoginPage.tsx
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuthStore } from '../store/authStore';
import type { UserDoc } from '../store/authStore';
import { useTreeStore } from '../store/treeStore';
import { loadTree, listTrees } from '../db/storageAdapter';
import { getFirebaseAuth, sendPasswordResetEmail, isFirebaseConfigured } from '../firebaseClient';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getUserProfile, createUserProfile } from '../db/realtimeDbAdapter';
import { AVATAR_COLORS } from '../appConfig';

function StatusDot({ status, label, detail }: { status: 'checking' | 'ok' | 'error' | 'unconfigured'; label: string; detail?: string }) {
  const COLOR: Record<string, string> = {
    checking: '#bdbdbd',
    ok: '#43A047',
    error: '#E53935',
    unconfigured: '#bdbdbd',
  };
  const LABEL: Record<string, string> = {
    checking: 'Checking…',
    ok: 'Connected',
    error: 'Error',
    unconfigured: 'Not configured',
  };
  const pulse = status === 'checking';
  return (
    <>
      {pulse && <style>{`@keyframes hpulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#555' }}
        title={detail ?? LABEL[status]}
      >
        <span style={{
          width: 9, height: 9, borderRadius: '50%',
          background: COLOR[status], display: 'inline-block', flexShrink: 0,
          animation: pulse ? 'hpulse 1s infinite' : 'none',
        }} />
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: status === 'error' ? '#E53935' : '#aaa', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {status === 'error' && detail ? `— ${detail}` : LABEL[status]}
        </span>
      </div>
    </>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<'signIn' | 'recovery'>('signIn');
  const [email, setEmail] = useState('');
  const [phrase, setPhrase] = useState('');
  const [showPhrase, setShowPhrase] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Signing in…');

  // Simplified health: derive from firebaseClient check
  const [health] = useState(() => {
    const configured = isFirebaseConfigured();
    return {
      rtdb: configured ? 'ok' : 'unconfigured',
      auth: configured ? 'ok' : 'unconfigured'
    } as const;
  });

  const { login } = useAuthStore();
  const { openTree, setTreeList } = useTreeStore();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const errToMessage = (err: unknown): string => {
      if (!err) return 'unknown error';
      if (typeof err === 'string') return err;
      if (typeof err === 'object' && err !== null) {
        const maybe = err as Record<string, unknown>;
        if (typeof maybe.message === 'string') return maybe.message;
        if (typeof maybe.code === 'string') return maybe.code;
      }
      return String(err);
    };

    try {
      const auth = getFirebaseAuth();
      const emailInput = email.trim();
      if (!emailInput || !emailInput.includes('@')) {
        setError('Please enter a valid email address');
        setLoading(false);
        return;
      }

      if (mode === 'recovery') {
        setLoadingMsg('Sending reset email…');
        try {
          await sendPasswordResetEmail(auth, emailInput);
          setSuccess('If this account exists, a password reset link has been sent to your email.');
          setMode('signIn');
        } catch (err: unknown) {
          setError(errToMessage(err));
        }
        return;
      }

      setLoadingMsg('Signing in…');
      // Type for the minimal credential shape we need
      type Cred = { user: { uid: string; email?: string | null; displayName?: string | null } };
      let credential: Cred;
      try {
        credential = await signInWithEmailAndPassword(auth, emailInput, phrase) as unknown as Cred;
      } catch (err: unknown) {
        console.warn('[login] auth sign-in failed', err);
        const code = (typeof err === 'object' && err && 'code' in err) ? String((err as Record<string, unknown>).code) : 'auth/error';
        setError(`${code}: ${errToMessage(err)}`);
        return;
      }

      const uid = credential.user.uid;

      // Fetch or create minimal profile at users_famt/{uid}
      interface Profile { username?: string; email?: string; role?: 'user' | 'dev'; displayName?: string; avatarColor?: string; allowed_trees?: string[] }
      let profile: Profile | null = null;
      try {
        profile = await getUserProfile(uid);
        if (!profile) {
          const emailVal = credential.user.email ?? '';
          const usernameFromEmail = emailVal.split('@')[0] || uid;
          const defaultProfile: Profile = {
            username: usernameFromEmail,
            email: emailVal,
            role: 'user',
            displayName: credential.user.displayName ?? usernameFromEmail,
            avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
            allowed_trees: [],
          };
          try { await createUserProfile(uid, defaultProfile); } catch { /* ignore write errors */ }
          profile = defaultProfile;
        }
      } catch (e: unknown) {
        console.warn('[login] failed to read profile doc', e);
      }

      const user: UserDoc = {
        _id: uid,
        username: profile?.username ?? (credential.user.email ?? uid),
        role: (profile?.role ?? 'user') as 'user' | 'dev',
        color: profile?.avatarColor ?? AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        allowed_trees: profile?.allowed_trees ?? [],
      };

      setLoadingMsg('Loading your trees…');
      let trees = [] as Array<{ folderName: string; treeName: string }>;
      try {
        trees = await listTrees();
        if (user.role === 'user' && user.allowed_trees) {
          const allowed = user.allowed_trees.map(t => t.toLowerCase().trim());
          trees = trees.filter(t => allowed.includes(t.treeName.toLowerCase().trim()));
        }
      } catch (e: unknown) {
        console.warn('[login] listTrees failed', errToMessage(e));
        trees = [];
      }

      setTreeList(trees);
      if (trees.length > 0) {
        const first = trees[0];
        try {
          const tree = await loadTree(first.folderName);
          openTree(tree, first.folderName, 'synced');
        } catch (e) {
          console.error('[login] failed to open first tree', e);
        }
      }

      login(user);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #E3F2FD 0%, #F3E5F5 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16,
        boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
        padding: '40px 44px', width: 380, maxWidth: '90vw',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48 }}>🌳</div>
          <h1 style={{ margin: '8px 0 4px', fontSize: 22, fontWeight: 800, color: '#1a1a1a' }}>FamTree</h1>
          <p style={{ margin: 0, fontSize: 13, color: '#888' }}>
            {mode === 'recovery' ? 'Reset your password' : 'Sign in to continue'}
          </p>
        </div>

        {/* Health status */}
        <div style={{
          background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8,
          padding: '10px 14px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
            Server Status
          </div>
          <StatusDot status={health.rtdb} label="Realtime DB" detail={undefined} />
          <StatusDot status={health.auth} label="Auth" detail={undefined} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={loading}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1.5px solid #e0e0e0', fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {mode === 'signIn' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>
                  Passphrase
                </label>
                <button
                  type="button"
                  onClick={() => setMode('recovery')}
                  style={{ background: 'none', border: 'none', color: '#1565C0', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPhrase ? 'text' : 'password'}
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  placeholder="Enter passphrase"
                  required
                  disabled={loading}
                  style={{
                    width: '100%', padding: '10px 40px 10px 12px', borderRadius: 8,
                    border: '1.5px solid #e0e0e0', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPhrase((v) => !v)}
                  tabIndex={-1}
                  title={showPhrase ? 'Hide' : 'Show'}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: 4, color: '#999', fontSize: 16, lineHeight: 1, userSelect: 'none',
                  }}
                >
                  {showPhrase ? '🙈' : '👁'}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div style={{
              background: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: 8,
              padding: '10px 12px', fontSize: 13, color: '#c62828', wordBreak: 'break-word',
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              background: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: 8,
              padding: '10px 12px', fontSize: 13, color: '#2E7D32', wordBreak: 'break-word',
            }}>
              {success}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1, padding: '12px', borderRadius: 8, border: 'none',
                background: loading ? '#90CAF9' : '#1565C0',
                color: '#fff', fontWeight: 700, fontSize: 15,
                cursor: loading ? 'default' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {loading ? loadingMsg : (mode === 'recovery' ? 'Send Reset Link' : 'Sign In')}
            </button>
            {mode === 'recovery' && (
              <button
                type="button"
                onClick={() => setMode('signIn')}
                disabled={loading}
                style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: '#999' }}>
          New users are created by administrators.
        </div>
      </div>
    </div>
  );
}
