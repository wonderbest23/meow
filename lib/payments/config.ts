export function paymentsEnabled() {
  const configured = process.env.PAYMENTS_ENABLED?.trim().toLowerCase();
  if (configured === undefined || configured === "") return true;
  return configured === "true" || configured === "1" || configured === "yes" || configured === "on";
}
