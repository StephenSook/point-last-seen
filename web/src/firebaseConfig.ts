// Reads the web app's Firebase config from the build env. The build fails
// when any value is missing or still the .env.example placeholder, so a
// deploy can never ship without the App Check site key.

export type FirebaseEnv = {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  siteKey: string;
};

const FIELDS = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
  appId: "VITE_FIREBASE_APP_ID",
} as const;
const SITE_KEY = "VITE_RECAPTCHA_ENTERPRISE_SITE_KEY";

function usable(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "" && !v.includes("replace-me");
}

export function readEnv(env: Record<string, unknown>): FirebaseEnv {
  const names = [...Object.values(FIELDS), SITE_KEY];
  const missing = names.filter((n) => !usable(env[n]));
  if (missing.length > 0) {
    throw new Error(`Missing build config: ${missing.join(", ")}. Copy .env.example to .env and fill it.`);
  }
  const get = (n: string) => (env[n] as string).trim();
  return {
    firebase: {
      apiKey: get(FIELDS.apiKey),
      authDomain: get(FIELDS.authDomain),
      projectId: get(FIELDS.projectId),
      storageBucket: get(FIELDS.storageBucket),
      messagingSenderId: get(FIELDS.messagingSenderId),
      appId: get(FIELDS.appId),
    },
    siteKey: get(SITE_KEY),
  };
}
