import { isNicepaySdkUrl, NICEPAY_ENDPOINTS } from "./nicepay-environment";

let pending: { url: string; promise: Promise<void> } | null = null;

export function loadNicepaySdk(url: unknown): Promise<void> {
  if (!isNicepaySdkUrl(url)) return Promise.reject(new Error("SDK_URL_INVALID"));
  if (typeof window === "undefined") return Promise.reject(new Error("SDK_BROWSER_REQUIRED"));
  if (pending) return pending.url === url ? pending.promise : Promise.reject(new Error("SDK_ENVIRONMENT_MISMATCH"));
  const scripts = Array.from(document.scripts).filter(script => Object.values(NICEPAY_ENDPOINTS).some(endpoint => endpoint.sdk === script.src));
  if (scripts.some(script => script.src !== url) || (window.AUTHNICE && !scripts.some(script => script.src === url))) {
    return Promise.reject(new Error("SDK_ENVIRONMENT_MISMATCH"));
  }
  if (window.AUTHNICE) return Promise.resolve();
  const promise = new Promise<void>((resolve, reject) => {
    const existing = scripts.find(script => script.src === url);
    const script = existing ?? document.createElement("script");
    const cleanup = () => { clearTimeout(timeout); script.removeEventListener("load", loaded); script.removeEventListener("error", failed); };
    const failed = () => { cleanup(); if (!existing) script.remove(); reject(new Error("SDK_LOAD_FAILED")); };
    const loaded = () => { if (!window.AUTHNICE) return failed(); cleanup(); resolve(); };
    const timeout = setTimeout(failed, 15_000);
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!existing) { script.src = url; script.async = true; document.head.appendChild(script); }
  });
  pending = { url, promise };
  void promise.catch(() => { pending = null; });
  return promise;
}
