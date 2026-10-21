"use client";

import { nativePlatform } from "./native-app";
import { showNotice } from "../components/confirm-dialog";

/*
 * 만든 파일(PDF·Word 등)을 손님 기기에 건넨다.
 *
 * 웹 브라우저: <a download> 로 바로 내려받는다.
 * 앱(아이폰·안드로이드) 안: 앱의 웹 화면(WKWebView)은 <a download> 를 무시해서, 누르면 창만 닫히고 아무 파일도 생기지 않았다
 * (시뮬레이터 점검 2026-10-21, 심사 중인 1.0 에도 같은 문제). 앱 안에서는 휴대폰 공유 창(navigator.share)으로 넘겨
 * '파일에 저장'·메시지·메일을 고르게 한다. 공유 창은 누른 직후에만 열 수 있는데, 파일을 만드는 동안 그 시간이 지나면
 * 한 번 더 눌러 달라고 묻고 그 누름으로 연다.
 */
export type SaveResult = "saved" | "shared" | "cancelled" | "unsupported";

function anchorDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function share(file: File): Promise<"shared" | "cancelled"> {
  try {
    await navigator.share({ files: [file], title: file.name });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
  }
}

export async function saveFile(blob: Blob, filename: string): Promise<SaveResult> {
  if (!nativePlatform()) { anchorDownload(blob, filename); return "saved"; }
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  if (typeof navigator.share !== "function" || (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] }))) return "unsupported";
  try {
    return await share(file);
  } catch (error) {
    // 파일을 만드는 사이 '누른 직후' 시간이 지났다 — 한 번 더 눌러 공유 창을 연다
    if (!(error instanceof DOMException && error.name === "NotAllowedError")) return "unsupported";
    await showNotice("파일이 준비됐어요. 아래 단추를 누르면 '파일에 저장'이나 보내기를 고를 수 있어요.", { title: "파일 받기", confirmLabel: "저장하거나 보내기" });
    try { return await share(file); } catch { return "unsupported"; }
  }
}

/** 미리 만들어 둔 파일(예시 문서 등)을 같은 방식으로 건넨다 */
export async function saveUrl(url: string, filename: string): Promise<SaveResult> {
  if (!nativePlatform()) { window.open(url, "_blank", "noopener"); return "saved"; }
  const response = await fetch(url);
  if (!response.ok) throw new Error("파일을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
  return saveFile(await response.blob(), filename);
}

/** 앱에서 공유 창을 열 수 없을 때의 안내 */
export const SAVE_UNSUPPORTED_MESSAGE = "이 기기에서는 파일을 바로 받을 수 없어요. 앱을 최신으로 업데이트한 뒤 다시 시도해 주세요.";
