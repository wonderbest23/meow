export function googleClientId(configured: string | undefined, environment: string | undefined) {
  return configured?.trim() || (environment === "staging" ? "" : "1003888311201-3ai90gt9sohnkc2u7oujs7i6igjo28ff.apps.googleusercontent.com");
}
