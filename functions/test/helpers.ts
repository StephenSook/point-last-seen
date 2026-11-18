// Emulator helpers for the rules and join tests. Run under `firebase emulators:exec`, which sets the
// *_EMULATOR_HOST variables. Client SDK instances carry emulator mock tokens with custom claims.
import { getApps, initializeApp as initAdmin } from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { getFirestore as adminFirestore } from "firebase-admin/firestore";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";

export const PROJECT = "demo-pls";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set: run the tests under firebase emulators:exec`);
  return v;
}
const FIRESTORE = need("FIRESTORE_EMULATOR_HOST");
const STORAGE = need("FIREBASE_STORAGE_EMULATOR_HOST");
need("FIREBASE_AUTH_EMULATOR_HOST");

export const adminApp = getApps()[0] ?? initAdmin({ projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` });
export const admin = { db: adminFirestore(adminApp), auth: adminAuth(adminApp) };

export type Claims = { inc?: string; role?: string; team?: string | null };
let n = 0;
const clientApps: FirebaseApp[] = [];

function clientApp(): FirebaseApp {
  const app = initializeApp({ projectId: PROJECT, apiKey: "fake-api-key", storageBucket: `${PROJECT}.appspot.com` }, `client-${n++}`);
  clientApps.push(app);
  return app;
}

/** A Firestore client signed in as `uid` with the given custom claims (or unauthenticated when uid is null). */
export function dbAs(uid: string | null, claims: Claims = {}): Firestore {
  const db = getFirestore(clientApp());
  const [host, port] = FIRESTORE.split(":");
  connectFirestoreEmulator(db, host!, Number(port), uid === null ? {} : { mockUserToken: { sub: uid, user_id: uid, ...claims } });
  return db;
}

export function storageAs(uid: string | null, claims: Claims = {}): FirebaseStorage {
  const st = getStorage(clientApp());
  const [host, port] = STORAGE.split(":");
  connectStorageEmulator(st, host!, Number(port), uid === null ? {} : { mockUserToken: { sub: uid, user_id: uid, ...claims } });
  return st;
}

export async function assertSucceeds<T>(p: Promise<T>): Promise<T> {
  return await p;
}

export async function assertFails(p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (/permission-denied|PERMISSION_DENIED|storage\/unauthorized|unauthorized/.test(code)) return;
    throw new Error(`expected a permission denial, got ${code || String(e)}`);
  }
  throw new Error("expected a permission denial, but the operation succeeded");
}

export async function clearFirestore(): Promise<void> {
  const r = await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!r.ok) throw new Error(`clearing the Firestore emulator failed: HTTP ${r.status}`);
}

export async function closeClients(): Promise<void> {
  await Promise.all(clientApps.splice(0).map(a => deleteApp(a)));
}

export const ID = "a".repeat(32);
export const ID2 = "b".repeat(32);
export const ID3 = "c".repeat(32);
export const ID4 = "d".repeat(32);
export const ID5 = "e".repeat(32);

export const searcherClaims: Claims = { inc: "I1", role: "searcher", team: "T1" };
export const commandClaims: Claims = { inc: "I1", role: "command", team: null };
export const familyClaims: Claims = { inc: "I1", role: "family", team: null };
