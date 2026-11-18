// One Firebase app for the command post. App Check starts before any other
// service so every AI Logic call carries a token. Firestore keeps an
// unlimited local cache so the post keeps working when the link drops.

import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";
import { getAuth, onAuthStateChanged, signInAnonymously, type Auth, type User } from "firebase/auth";
import {
  CACHE_SIZE_UNLIMITED,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { readEnv, type FirebaseEnv } from "./firebaseConfig";

export type Pls = { env: FirebaseEnv; app: FirebaseApp; appCheck: AppCheck; db: Firestore; auth: Auth; functions: Functions };

let instance: Pls | undefined;

export function getPls(): Pls {
  if (instance) return instance;
  const env = readEnv(import.meta.env);
  const app = initializeApp(env.firebase);
  const appCheck = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(env.siteKey), isTokenAutoRefreshEnabled: true });
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: CACHE_SIZE_UNLIMITED }),
  });
  const auth = getAuth(app);
  const functions = getFunctions(app, "us-central1");
  instance = { env, app, appCheck, db, auth, functions };
  return instance;
}

/** Resolves with the signed-in user, signing in anonymously when there is none. */
export function ensureSignedIn(auth: Auth): Promise<User> {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          stop();
          resolve(user);
        } else {
          signInAnonymously(auth).catch((e: unknown) => {
            stop();
            reject(e);
          });
        }
      },
      (e) => {
        stop();
        reject(e);
      },
    );
  });
}
