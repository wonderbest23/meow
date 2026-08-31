"use client";

/*
 * 검토에서 찾은 문제를 그 자리에서 고친다.
 *
 * 예전에는 '해당 섹션 열기'뿐이라, 고치려면 검토 목록을 떠나 위저드로 갔다가
 * 다시 돌아와야 했다(사용자 지적: "너무 불편하잖아"). 문제 카드 안에서 본문을
 * 바로 펼쳐 고치고 저장한다 — 화면을 떠나지 않으므로 다른 문제와 같이 보면서
 * 손볼 수 있다.
 *
 * 저장은 문서 편집기와 같은 칸(saveSection · edited=true)이다. 직접 고친 본문은
 * 다시쓰기 대상에서 빠지므로, AI 가 사용자의 수정을 덮어쓰지 않는다.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { activePlan, saveSection } from "../../lib/plan-builder/plan-store";
import { PLAN_BLUEPRINT } from "../../lib/plan-builder/blueprint";
import styles from "./ReviewPanel.module.css";

function sectionTitle(key: string): string {
  for (const chapter of PLAN_BLUEPRINT) {
    for (const section of chapter.sections) if (`${chapter.id}/${section.id}` === key) return `${chapter.title} · ${section.title}`;
  }
  return key;
}

export default function ReviewInlineEdit({
  sectionKey,
  planId,
  onSaved,
  onClose,
}: {
  sectionKey: string;
  planId: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const original = useMemo(() => activePlan()?.sections?.[sectionKey]?.markdown ?? "", [sectionKey]);
  const [draft, setDraft] = useState(original);
  /* 저장 뒤에는 방금 저장한 글이 새 기준이다 — 아니면 버튼이 계속 '저장'으로 남는다 */
  const [baseline, setBaseline] = useState(original);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const locked = Boolean(activePlan()?.sections?.[sectionKey]?.locked);

  useEffect(() => { setDraft(original); setBaseline(original); setSaved(false); }, [original]);

  const dirty = draft !== baseline;

  async function save() {
    if (!dirty || busy) return;
    setBusy(true);
    setError("");
    try {
      /* marked 는 무거워서 첫 화면 묶음에 넣지 않는다 — 저장할 때만 가져온다 */
      const { renderPlanMarkdown } = await import("../../lib/plan-builder/markdown");
      const html = await renderPlanMarkdown(draft);
      const ok = saveSection(sectionKey, draft, html, { edited: true, keepPrevious: true, planId });
      if (!ok) { setError("저장하지 못했어요. 예시 플랜은 고칠 수 없습니다."); return; }
      setBaseline(draft);
      setSaved(true);
      onSaved();
    } catch {
      setError("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (!original) {
    return (
      <div className={styles.inline}>
        <p className={styles.inlineNote}>이 섹션은 아직 본문이 없어요. 먼저 본문을 만들면 여기서 바로 고칠 수 있습니다.</p>
        <div className={styles.actions}><button type="button" className={styles.ghost} onClick={onClose}>닫기</button></div>
      </div>
    );
  }

  return (
    <div className={styles.inline}>
      <div className={styles.inlineHead}>
        <strong>{sectionTitle(sectionKey)}</strong>
        {locked && <span className={styles.tag}>잠김 — 다시쓰기 안 함</span>}
      </div>
      <textarea
        className={styles.inlineArea}
        value={draft}
        onChange={(event) => { setDraft(event.target.value); setSaved(false); }}
        rows={Math.min(20, Math.max(8, draft.split("\n").length + 2))}
        spellCheck={false}
        aria-label="본문 고치기"
      />
      {error && <p className={styles.inlineErr}>{error}</p>}
      <p className={styles.inlineNote}>
        여기서 고친 본문은 <b>직접 수정</b>으로 표시되어, 이후 AI 다시쓰기가 덮어쓰지 않아요.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.btn} onClick={() => void save()} disabled={!dirty || busy}>
          {busy ? <RefreshCw size={14} className={styles.spin} /> : saved ? <Check size={14} /> : null}
          {busy ? "저장 중…" : saved && !dirty ? "저장됨" : "저장"}
        </button>
        <button type="button" className={styles.ghost} onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
