export const NICEPAY_ENDPOINTS = {
  production: { api: "https://api.nicepay.co.kr/v1", sdk: "https://pay.nicepay.co.kr/v1/js/" },
  // The official TEST sample uses the shared SDK; the test merchant key selects its checkout.
  sandbox: { api: "https://sandbox-api.nicepay.co.kr/v1", sdk: "https://pay.nicepay.co.kr/v1/js/" },
} as const;

export function isNicepaySdkUrl(value: unknown): value is string {
  return typeof value === "string" && Object.values(NICEPAY_ENDPOINTS).some(endpoint => endpoint.sdk === value);
}

export function nicepayEnvironment(env: Record<string, string | undefined> = process.env) {
  const mode = env.NICEPAY_ENVIRONMENT?.trim() || "production";
  if (mode !== "production" && mode !== "sandbox") throw new Error("NICEPAY_ENVIRONMENT_INVALID");
  const isolated = env.APP_ENV === "staging" || env.APP_ENV === "prelaunch";
  if (isolated && mode !== "sandbox") throw new Error("NICEPAY_SANDBOX_REQUIRED");
  if (mode === "sandbox" && (env.NICEPAY_CLIENT_KEY?.trim() || env.NICEPAY_SECRET_KEY?.trim())) {
    throw new Error("NICEPAY_LIVE_KEYS_IN_SANDBOX");
  }
  return {
    mode,
    ...NICEPAY_ENDPOINTS[mode],
    clientKey: (mode === "sandbox" ? env.NICEPAY_SANDBOX_CLIENT_KEY : env.NICEPAY_CLIENT_KEY)?.trim() || null,
    secretKey: (mode === "sandbox" ? env.NICEPAY_SANDBOX_SECRET_KEY : env.NICEPAY_SECRET_KEY)?.trim() || null,
  };
}
