import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';

export interface FirebaseConfig {
  projectId: string;
  serviceAccountJsonPath?: string;
}

let cachedApp: App | undefined;
let cachedAuth: Auth | undefined;

export function getFirebaseApp(config: FirebaseConfig): App {
  if (cachedApp) return cachedApp;

  const existing = getApps()[0];
  if (existing) {
    cachedApp = existing;
    return existing;
  }

  if (config.serviceAccountJsonPath) {
    const raw = readFileSync(config.serviceAccountJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
    cachedApp = initializeApp({
      credential: cert({
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
      }),
      projectId: config.projectId,
    });
  } else {
    cachedApp = initializeApp({ projectId: config.projectId });
  }

  return cachedApp;
}

export function getFirebaseAuth(config: FirebaseConfig): Auth {
  if (cachedAuth) return cachedAuth;
  cachedAuth = getAuth(getFirebaseApp(config));
  return cachedAuth;
}

export function resetFirebaseForTests(): void {
  cachedApp = undefined;
  cachedAuth = undefined;
}
