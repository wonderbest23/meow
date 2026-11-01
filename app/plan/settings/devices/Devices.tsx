"use client";

import { useEffect, useState } from "react";
import { SettingsCard, SettingsHeader, SettingsRow, SettingsSection } from "../../../../components/settings-row";
import { StatusBadge } from "../../../../components/status-badge";
import { nativePlatform } from "../../../../lib/native-app";
import styles from "../settings.module.css";

/*
 * 기기 및 앱 — 바꿀 수 있는 설정은 없고, 지금 있는 사실만 보인다.
 * 지금 쓰는 곳(앱 안이면 Capacitor 가 알려 준다) · 화면 설정(밝은 화면 하나, 글자 크기는 기기 설정 — 프로필 메뉴 '화면 설정'과 같은 문구).
 */
export default function Devices() {
  const [platform, setPlatform] = useState<"ios" | "android" | "web" | null>(null);
  useEffect(() => { setPlatform(nativePlatform() ?? "web"); }, []);
  const label = platform === "ios" ? "아이폰 앱" : platform === "android" ? "안드로이드 앱" : platform === "web" ? "웹 브라우저" : "확인 중";
  return <div className={styles.page}>
    <SettingsHeader title="기기 및 앱" description="지금 쓰는 기기와 화면 설정이에요." mobile="band" />
    <SettingsSection id="devices-current" title="이 기기">
      <SettingsCard mobile="band">
        <SettingsRow inline title="지금 쓰는 곳" description="로그인하면 앱과 웹에서 같은 사업을 이어서 볼 수 있어요." control={<StatusBadge tone="info">{label}</StatusBadge>} />
        <SettingsRow title="화면 설정" description="밝은 화면으로 보여 드려요. 글자 크기는 기기·브라우저의 글자 크기 설정을 따라요." />
      </SettingsCard>
    </SettingsSection>
  </div>;
}
