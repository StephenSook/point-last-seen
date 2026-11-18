// Test harness for exported callables: a raw request through the Functions wrapper, and an emulator ID token.

/** Invokes the exported HTTP handler with a minimal request and response, as the Functions runtime would. */
export async function callRaw(r: { method: string; body: unknown; idToken?: string; appCheck?: string; fn: unknown }): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { "content-type": "application/json", origin: "https://example.test" };
  if (r.idToken) headers.authorization = `Bearer ${r.idToken}`;
  if (r.appCheck) headers["x-firebase-appcheck"] = r.appCheck;
  const req = {
    method: r.method, url: "/", headers, body: r.body, rawBody: Buffer.from(JSON.stringify(r.body)),
    header: (n: string) => headers[n.toLowerCase()], get: (n: string) => headers[n.toLowerCase()],
  };
  return await new Promise(resolve => {
    let status = 200;
    const out: Record<string, unknown> = {};
    const res = {
      statusCode: 200,
      setHeader: (k: string, v: unknown) => { out[k.toLowerCase()] = v; },
      getHeader: (k: string) => out[k.toLowerCase()],
      removeHeader: (k: string) => { delete out[k.toLowerCase()]; },
      status(code: number) { status = code; this.statusCode = code; return this; },
      json(body: unknown) { resolve({ status, body }); return this; },
      send(body: unknown) { resolve({ status, body }); return this; },
      end(body?: unknown) { resolve({ status: this.statusCode ?? status, body }); return this; },
      on: () => res, once: () => res,
    };
    void (r.fn as (q: unknown, s: unknown) => unknown)(req, res);
  });
}

/** An ID token from the Auth emulator for a new anonymous user. */
export async function emulatorIdToken(): Promise<{ idToken: string; uid: string }> {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST!;
  const r = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) });
  const j = (await r.json()) as { idToken: string; localId: string };
  return { idToken: j.idToken, uid: j.localId };
}

