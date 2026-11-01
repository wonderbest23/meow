"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearLocalState } from "../../../lib/plan-builder/plan-store";
import { askConfirm } from "../../../components/confirm-dialog";
import { apiMessage, userErrorMessage } from "../../../lib/client/user-error";
import { AppButton, type AppButtonSize } from "../../../components/app-button";
import { FieldError, TextField } from "../../../components/app-field";
import { SettingsRow } from "../../../components/settings-row";
import styles from "./PlanMe.module.css";

/*
 * 로그아웃 · 회원 탈퇴 — 내 계정(/plan/me)과 휴대폰 보안(/plan/settings/security)이 같은 것을 쓴다.
 * 예전 내 계정 화면에 있던 흐름 그대로다(서버 응답 확인 · 이메일 다시 입력 · 마지막 확인창 · 초점 이동).
 */

/** 이메일 없는 계정이 탈퇴할 때 적는 확인 문구 — 서버(app/api/auth/delete)와 같은 값 */
export const NO_EMAIL_CONFIRM = "탈퇴";

/** 로그아웃 행 — 이 기기에서만 나간다 */
export function LogoutRow({ size = "compact" }: { size?: AppButtonSize }) {
  const router = useRouter();
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutMessage, setLogoutMessage] = useState("");
  async function logout() {
    if (logoutBusy) return;
    setLogoutMessage(""); setLogoutBusy(true);
    try { await doLogout(); } finally { setLogoutBusy(false); }
  }
  async function doLogout() {
    /*
     * 서버 세션이 실제로 끊겼는지 확인한다.
     * 예전에는 응답을 보지 않고 화면만 정리했다 — 통신이 실패하면
     * 로그아웃된 것처럼 보이지만 세션은 살아 있다(공용 PC에서 위험하다).
     */
    const res = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!res || !res.ok) {
      /* 예전엔 탈퇴 칸 안에 적어서(열려 있을 때만 보임) 실패해도 아무 안내가 없었다 */
      setLogoutMessage("로그아웃하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
      return;
    }
    // 로컬 플랜 캐시도 함께 비운다 — 로그아웃 후에도 이전 계정 플랜이 보이던 버그
    clearLocalState();
    router.push("/plan");
  }
  return <SettingsRow title="로그아웃" description="이 기기에서만 나가요. 사업은 그대로 남아요."
    control={<AppButton type="button" variant="secondary" size={size} className={styles.logout} disabled={logoutBusy} onClick={() => void logout()}>{logoutBusy ? "로그아웃 중…" : "로그아웃"}</AppButton>}>
    {logoutMessage && <p className={styles.rowNotice} role="alert">{logoutMessage}</p>}
  </SettingsRow>;
}

/** 회원 탈퇴 행 — 실수 방지를 위해 이메일(이메일 없는 계정은 '탈퇴')을 다시 입력받는다 */
export function DeleteAccountRow({ email, size = "compact" }: { email: string | null; size?: AppButtonSize }) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  // 탈퇴 칸을 열면 이메일 칸으로, 취소하면 '탈퇴 진행하기'로 초점을 옮긴다 — 예전엔 누른 단추가 사라져 초점이 body로 떨어졌다
  const deleteOpener = useRef<HTMLButtonElement>(null);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");

  async function deleteAccount() {
    if (deleteBusy) return;
    /* 이메일이 다르면 마지막 확인창을 띄우지 않고 바로 알린다 — 예전엔 확인창까지 간 뒤 서버에서 거절됐다 */
    if (email ? deleteEmail.trim().toLowerCase() !== email.toLowerCase() : deleteEmail.trim() !== NO_EMAIL_CONFIRM) {
      setDeleteMessage(email ? "로그인한 이메일과 달라요. 위에 보이는 이메일을 그대로 적어 주세요." : `확인 칸에 '${NO_EMAIL_CONFIRM}'를 그대로 적어 주세요.`);
      return;
    }
    if (!await askConfirm({ title: "정말 탈퇴할까요?", message: "작성한 사업과 문서, 공개한 홈페이지가 모두 지워지고 되돌릴 수 없어요.", confirmLabel: "탈퇴하기", danger: true })) return;
    setDeleteBusy(true);
    setDeleteMessage("");
    try {
      const response = await fetch("/api/auth/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(email ? { email: deleteEmail.trim() } : { confirm: deleteEmail.trim() }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || data === null) throw new Error(apiMessage(data, "탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요."));
      clearLocalState();
      router.push("/");
      router.refresh();
    } catch (error) {
      setDeleteMessage(userErrorMessage(error, "탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setDeleteBusy(false);
    }
  }

  const note = "계정과 사업·문서가 모두 지워져요. 공개한 홈페이지도 닫히고 연결한 도메인도 끊어져요. 결제·환불 기록은 법령상 보존 의무가 있어 사람과 연결되지 않는 형태로만 남아요.";
  if (!showDelete) return <SettingsRow title="회원 탈퇴" description={note}
    control={<AppButton ref={deleteOpener} type="button" variant="dangerOutline" size={size} className={styles.dangerOpen} onClick={() => { setShowDelete(true); setDeleteMessage(""); }}>
      탈퇴 진행하기
    </AppButton>} />;
  return <SettingsRow stack title="회원 탈퇴" description={note}>
    <div className={styles.deleteForm}>
      {/* 이메일 없는 계정(카카오 등)은 다시 적을 이메일이 없어 탈퇴할 수 없었다 — '탈퇴'를 적게 한다(감사 2026-10-23) */}
      <p id="delete-guide" className={styles.deleteGuide}>
        {email
          ? <>되돌릴 수 없어요. 계속하려면 로그인한 이메일 <b>{email}</b> 을 그대로 적어 주세요.</>
          : <>되돌릴 수 없어요. 계속하려면 아래 칸에 <b>{NO_EMAIL_CONFIRM}</b> 를 그대로 적어 주세요.</>}
      </p>
      <TextField
        className={styles.deleteInput}
        aria-label={email ? "탈퇴 확인용 이메일" : "탈퇴 확인 문구"}
        type={email ? "email" : "text"}
        data-size="compact"
        autoFocus
        value={deleteEmail}
        onChange={(event) => { setDeleteEmail(event.target.value); setDeleteMessage(""); }}
        placeholder={email ? "이메일 입력" : NO_EMAIL_CONFIRM}
        autoComplete="off"
        aria-invalid={deleteMessage ? true : undefined}
        aria-describedby={deleteMessage ? "delete-guide delete-error" : "delete-guide"}
      />
      {deleteMessage && <FieldError id="delete-error" className={styles.deleteError} role="alert">{deleteMessage}</FieldError>}
      <div className={styles.deleteActions}>
        <AppButton
          type="button"
          variant="danger"
          size={size}
          className={styles.dangerBtn}
          disabled={deleteBusy || deleteEmail.trim().length < (email ? 5 : NO_EMAIL_CONFIRM.length)}
          onClick={() => void deleteAccount()}
        >
          {deleteBusy ? "처리 중…" : "탈퇴하기"}
        </AppButton>
        <AppButton type="button" variant="soft" size={size} className={styles.refundCancel} onClick={() => { setShowDelete(false); window.requestAnimationFrame(() => deleteOpener.current?.focus()); }}>취소</AppButton>
      </div>
    </div>
  </SettingsRow>;
}
