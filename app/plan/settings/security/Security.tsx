"use client";

import { useEffect, useState } from "react";
import { SettingsCard, SettingsHeader, SettingsRow, SettingsSection } from "../../../../components/settings-row";
import { loadAuthSession } from "../../../../lib/client/auth-session";
import { DeleteAccountRow, LogoutRow } from "../../me/AccountActions";
import PlanGate from "../../PlanGate";
import PlanLoading from "../../PlanLoading";
import styles from "../settings.module.css";

/*
 * 보안 — 내 계정 화면과 같은 로그아웃 · 회원 탈퇴 행(AccountActions)을 휴대폰 흰 띠(MPref)로 보인다.
 * 로그인 수단(카카오·애플) 표시·연결은 지금 서버가 알려 주지 않아(/api/auth/session 은 이메일만) 두지 않았다.
 */
export default function Security() {
  const [account, setAccount] = useState<{ authenticated: boolean; email: string | null } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadAuthSession().then(data => { if (alive) setAccount({ authenticated: !!data.authenticated, email: data.email ?? null }); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);
  const header = <SettingsHeader title="보안" description="이 기기에서 나가거나 계정을 정리해요." mobile="band" />;
  if (!account) return <div className={styles.page}>{header}{failed ? <p className={styles.rowNotice} role="alert">로그인 상태를 확인하지 못했어요. 연결을 확인한 뒤 새로고침해 주세요.</p> : <PlanLoading variant="rows" count={2} note="계정 정보를 불러오는 중…" />}</div>;
  if (!account.authenticated) return <div className={styles.page}>{header}<PlanGate reason="login_required" /></div>;
  return <div className={styles.page}>
    {header}
    <SettingsSection id="security-account" title="로그인" description={account.email ? `${account.email} 으로 들어와 있어요.` : "이메일 없이 로그인한 계정이에요."}>
      <SettingsCard mobile="band">
        <LogoutRow size="adaptive" />
      </SettingsCard>
    </SettingsSection>
    <SettingsSection id="security-danger" title="계정 정리" description="되돌릴 수 없는 일이라 따로 모아 두었어요.">
      <SettingsCard mobile="band">
        <DeleteAccountRow email={account.email} size="adaptive" />
      </SettingsCard>
    </SettingsSection>
  </div>;
}
