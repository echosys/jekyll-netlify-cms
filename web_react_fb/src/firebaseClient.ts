// firebaseClient.ts — initialize Firebase client SDK using Vite env vars
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, sendPasswordResetEmail } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';

// Optional: import project config from a JSON file in the root if available at build time.
// @ts-ignore
import firebaseConfigRaw from '../firebase.config?raw';

let firebaseConfig: any = null;
try {
  if (firebaseConfigRaw) {
    firebaseConfig = JSON.parse(firebaseConfigRaw);
  }
} catch (e) {
  console.warn('[firebase] Failed to parse firebase.config', e);
}


export function initFirebase() {
  if (getApps().length > 0) return;
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined;

  const explicitUseEmu = (import.meta.env.VITE_FIREBASE_USE_EMULATOR as string) === 'true';
  // If running in Vite dev mode and required VITE_FIREBASE_* vars are missing, assume emulator usage.
  const missingConfig = !apiKey && !projectId && !appId && !firebaseConfig;
  const devMode = Boolean((import.meta.env as any).DEV);
  const useEmu = explicitUseEmu || (devMode && missingConfig);

  if (missingConfig && !useEmu) {
    // Do not throw — allow the app to boot but firebase operations will fail until configured.
    console.warn('[firebase] Missing configuration (file or env vars) and not in emulator mode. Firebase not initialized.');
    return;
  }

  // Prioritize firebase.config file, then fall back to env vars
  const config = {
    apiKey: (firebaseConfig?.apiKey || apiKey) ?? 'fake-api-key',
    authDomain: (firebaseConfig?.authDomain || authDomain) ?? 'localhost',
    projectId: (firebaseConfig?.projectId || projectId) ?? 'demo-project',
    databaseURL: (firebaseConfig?.databaseURL || databaseURL) ?? `https://${firebaseConfig?.projectId || projectId || 'demo-project'}-default-rtdb.firebaseio.com`,
    appId: (firebaseConfig?.appId || appId) ?? '1:fake:app',
  };

  initializeApp(config);

  // If running locally with emulators, connect the client SDK to them
  if (useEmu) {
    // Auth
    const authHost = (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST as string) || '127.0.0.1';
    const authPort = parseInt((import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT as string) || '9099', 10);
    try {
      connectAuthEmulator(getAuth(), `http://${authHost}:${authPort}`, { disableWarnings: true });
      console.info('[firebase] connected Auth emulator', authHost, authPort);
    } catch (e) {
      console.warn('[firebase] connectAuthEmulator failed', e);
    }

    // Realtime Database
    const dbHost = (import.meta.env.VITE_FIREBASE_DATABASE_EMULATOR_HOST as string) || '127.0.0.1';
    const dbPort = parseInt((import.meta.env.VITE_FIREBASE_DATABASE_EMULATOR_PORT as string) || '9000', 10);
    try {
      connectDatabaseEmulator(getDatabase(), dbHost, dbPort);
      console.info('[firebase] connected Realtime Database emulator', dbHost, dbPort);
    } catch (e) {
      console.warn('[firebase] connectDatabaseEmulator failed', e);
    }
  }
}

export function getFirebaseAuth() {
  try { initFirebase(); return getAuth(); } catch { throw new Error('Firebase Auth not configured'); }
}
export function getFirebaseRtDb() {
  try { initFirebase(); return getDatabase(); } catch { throw new Error('Realtime Database not configured'); }
}

export { sendPasswordResetEmail };

/** Check if Firebase is configured via file or env vars */
export function isFirebaseConfigured() {
  const f = firebaseConfig as any;
  const hasFile = Boolean(f && f.apiKey && f.projectId && f.appId);
  const hasEnv = Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID
  );
  return hasFile || hasEnv;
}
