/*
 * 앱(아이폰·안드로이드) 안에서 열렸는지와 앱 전용 기능.
 *
 * 앱(mobile/)은 운영 사이트를 그대로 연다. 앱 안에서는 Capacitor 가 window.Capacitor 를 넣어 주므로,
 * 웹 코드는 패키지를 따로 들이지 않고 이 전역으로 휴대폰 기능(로그인 창 등)을 부른다.
 * 웹 브라우저에서는 window.Capacitor 가 없어 모든 함수가 '앱 아님'으로 돌아간다.
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
};

type SocialLoginPlugin = {
  initialize: (options: Record<string, unknown>) => Promise<void>;
  login: (options: { provider: "google" | "apple"; options: Record<string, unknown> }) => Promise<{ result?: { idToken?: string | null } }>;
};

function capacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor ?? null;
}

/** 앱 안이면 'ios'·'android', 웹 브라우저면 null */
export function nativePlatform(): "ios" | "android" | null {
  const cap = capacitor();
  if (!cap?.isNativePlatform?.()) return null;
  const platform = cap.getPlatform?.();
  return platform === "ios" || platform === "android" ? platform : null;
}

let initialized: Promise<void> | null = null;

/**
 * 휴대폰 로그인 창으로 구글·애플 ID 토큰을 받는다.
 * 구글은 앱 안 웹 화면에서 로그인을 막으므로(보안 정책) 앱에서는 이 길로만 로그인한다.
 */
export async function nativeIdToken(provider: "google" | "apple", ids: { googleWebClientId?: string; googleIosClientId?: string }): Promise<string> {
  const plugin = capacitor()?.Plugins?.SocialLogin as SocialLoginPlugin | undefined;
  if (!plugin) throw new Error("앱의 로그인 기능을 찾지 못했습니다. 앱을 최신으로 업데이트해 주세요.");
  initialized ??= plugin.initialize({
    google: { webClientId: ids.googleWebClientId, iOSClientId: ids.googleIosClientId, mode: "online" },
    apple: {},
  }).catch((error) => { initialized = null; throw error; });
  await initialized;
  const response = await plugin.login({ provider, options: provider === "google" ? { scopes: ["email", "profile"] } : { scopes: ["email", "name"] } });
  const token = response.result?.idToken;
  if (!token) throw new Error("로그인을 마치지 못했습니다. 다시 시도해 주세요.");
  return token;
}
