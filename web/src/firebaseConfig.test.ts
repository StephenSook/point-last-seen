import { describe, expect, it } from "vitest";
import { readEnv } from "./firebaseConfig";

const fullEnv = {
  VITE_FIREBASE_API_KEY: "k",
  VITE_FIREBASE_AUTH_DOMAIN: "p.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "p",
  VITE_FIREBASE_STORAGE_BUCKET: "p.firebasestorage.app",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "1",
  VITE_FIREBASE_APP_ID: "1:1:web:1",
  VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: "site",
};

describe("readEnv", () => {
  it("maps a full env to the Firebase options and the site key", () => {
    expect(readEnv(fullEnv)).toEqual({
      firebase: {
        apiKey: "k",
        authDomain: "p.firebaseapp.com",
        projectId: "p",
        storageBucket: "p.firebasestorage.app",
        messagingSenderId: "1",
        appId: "1:1:web:1",
      },
      siteKey: "site",
    });
  });

  it("the build config fails without the reCAPTCHA site key", () => {
    expect(() => readEnv({ ...fullEnv, VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: "" })).toThrow(/VITE_RECAPTCHA_ENTERPRISE_SITE_KEY/);
    const { VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: _drop, ...noKey } = fullEnv;
    expect(() => readEnv(noKey)).toThrow(/VITE_RECAPTCHA_ENTERPRISE_SITE_KEY/);
  });

  it("fails on any missing Firebase value and names every missing one", () => {
    const { VITE_FIREBASE_APP_ID: _a, VITE_FIREBASE_API_KEY: _b, ...partial } = fullEnv;
    expect(() => readEnv(partial)).toThrow(/VITE_FIREBASE_API_KEY.*VITE_FIREBASE_APP_ID|VITE_FIREBASE_APP_ID.*VITE_FIREBASE_API_KEY/);
  });

  it("treats the .env.example placeholder as missing", () => {
    expect(() => readEnv({ ...fullEnv, VITE_FIREBASE_PROJECT_ID: "replace-me" })).toThrow(/VITE_FIREBASE_PROJECT_ID/);
    expect(() => readEnv({ ...fullEnv, VITE_FIREBASE_AUTH_DOMAIN: "replace-me.firebaseapp.com" })).toThrow(/VITE_FIREBASE_AUTH_DOMAIN/);
  });

  it("treats whitespace as missing", () => {
    expect(() => readEnv({ ...fullEnv, VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: "  " })).toThrow(/VITE_RECAPTCHA_ENTERPRISE_SITE_KEY/);
  });
});
