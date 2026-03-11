/**
 * Root.tsx — Top-level auth gate.
 * Waits for sessionStorage rehydration before deciding which page to show,
 * so the login page never flashes when the user already has a valid session.
 */
import App from './App';
import LoginPage from './pages/LoginPage';
import { useAuthStore } from './store/authStore';

export default function Root() {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s._hasHydrated);

  console.log('[Root] render: hydrated=', hydrated, 'user=', user?.username ?? null, 'role=', user?.role ?? null);

  // Don't render anything until the persisted session has loaded
  if (!hydrated) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif', color: '#aaa', fontSize: 14,
      }}>
        🌳 Loading…
      </div>
    );
  }

  return user ? <App /> : <LoginPage />;
}
