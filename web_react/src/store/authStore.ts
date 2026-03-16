/**
 * authStore.ts — Zustand store for authenticated user state.
 * Persisted to sessionStorage (cleared when tab closes).
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface UserDoc {
  _id?: string;
  username: string;
  role: 'dev' | 'user';
  color: string;       // hex color e.g. "#1E88E5"
  lastActivity?: number;
  /** List of tree names this user is allowed to access (case-insensitive, stripped match). Dev = no restriction. */
  allowed_trees?: string[];
}

interface AuthState {
  user: UserDoc | null;
  _hasHydrated: boolean;
  login: (user: UserDoc) => void;
  logout: () => void;
  setHasHydrated: (v: boolean) => void;
  /** Patch allowed_trees on the cached user doc after a server-side refresh */
  updateAllowedTrees: (trees: string[] | undefined) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      _hasHydrated: false,
      login: (user) => set({ user }),
      logout: () => set({ user: null }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      updateAllowedTrees: (trees) =>
        set((s) => s.user ? { user: { ...s.user, allowed_trees: trees } } : {}),
    }),
    {
      name: 'famt_auth',
      storage: createJSONStorage(() => sessionStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
