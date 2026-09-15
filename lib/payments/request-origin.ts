const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function paymentRequestOrigin(request: Request) {
  const configured = process.env.PLATFORM_APP_ORIGIN?.trim();
  if (configured) {
    const url = new URL(configured);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("PAYMENT_ORIGIN_INVALID");
    return url.origin;
  }
  const url = new URL(request.url);
  // Next can normalize 127.0.0.1 to localhost; preserve only a matching local Host.
  const host = request.headers.get("host");
  if (loopback.has(url.hostname) && host) {
    const local = new URL(`${url.protocol}//${host}`);
    if (loopback.has(local.hostname) && local.host === host && local.port === url.port) return local.origin;
  }
  return url.origin;
}

export function isPaymentSameOrigin(request: Request) {
  try { return request.headers.get("origin") === paymentRequestOrigin(request); }
  catch { return false; }
}
