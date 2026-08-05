"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { ChartFigure } from "./chart-node";
import styles from "./InlineDocEditor.module.css";
import { Spinner } from "./PlanLoading";

export interface InlineDocEditorProps {
  /** 초기 본문 (서버에서 렌더한 HTML) */
  html: string;
  /**
   * 편집이 멈춘 뒤 호출. HTML을 넘기며, 저장(마크다운 역변환 포함)은 상위가 맡는다.
   * 디바운스는 이 컴포넌트가 처리한다.
   */
  onChange: (html: string) => void;
  /** 저장 상태 표시용 */
  status?: "idle" | "saving" | "saved" | "failed";
  /** 디바운스(ms) */
  debounceMs?: number;
}

const SAVE_DEBOUNCE = 1500;

/**
 * 문서를 늘 편집 가능한 상태로 보여주는 인라인 편집기.
 * 버튼을 눌러 '편집 모드'로 들어가지 않고, 그 자리에서 바로 고친다.
 * 글자를 선택하면 그 위에 서식 툴바가 뜬다.
 */
export default function InlineDocEditor({ html, onChange, status = "idle", debounceMs = SAVE_DEBOUNCE }: InlineDocEditorProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onChange);
  latest.current = onChange;

  const editor = useEditor({
    immediatelyRender: false, // SSR과 첫 렌더가 어긋나지 않게
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, autolink: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      ChartFigure,
    ],
    content: html,
    editorProps: {
      attributes: { class: styles.surface, spellcheck: "false" },
    },
    onUpdate: ({ editor }) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => latest.current(editor.getHTML()), debounceMs);
    },
  });

  // 다른 섹션으로 이동하거나 다시 생성했을 때 본문 교체
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() === html) return;
    editor.commands.setContent(html, { emitUpdate: false });
  }, [html, editor]);

  // 화면을 떠나기 전 마지막 변경을 흘려보내지 않는다
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, []);

  if (!editor) return <div className={styles.wrap} />;

  const btn = (active: boolean) => `${styles.tbBtn} ${active ? styles.tbOn : ""}`;

  return (
    <div className={styles.wrap}>
      <BubbleMenu editor={editor} className={styles.toolbar}>
        <button type="button" className={btn(editor.isActive("heading", { level: 2 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="큰 제목">H2</button>
        <button type="button" className={btn(editor.isActive("heading", { level: 3 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="작은 제목">H3</button>
        <span className={styles.tbSep} />
        <button type="button" className={btn(editor.isActive("bold"))}
          onClick={() => editor.chain().focus().toggleBold().run()} title="굵게"><b>B</b></button>
        <button type="button" className={btn(editor.isActive("italic"))}
          onClick={() => editor.chain().focus().toggleItalic().run()} title="기울임"><i>I</i></button>
        <span className={styles.tbSep} />
        <button type="button" className={btn(editor.isActive("bulletList"))}
          onClick={() => editor.chain().focus().toggleBulletList().run()} title="글머리 목록">• 목록</button>
        <button type="button" className={btn(editor.isActive("orderedList"))}
          onClick={() => editor.chain().focus().toggleOrderedList().run()} title="번호 목록">1. 목록</button>
        <button type="button" className={btn(editor.isActive("blockquote"))}
          onClick={() => editor.chain().focus().toggleBlockquote().run()} title="인용">❝</button>
        <span className={styles.tbSep} />
        <button type="button" className={styles.tbBtn}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="표 넣기">표</button>
        <button type="button" className={btn(editor.isActive("link"))}
          onClick={() => {
            const prev = editor.getAttributes("link").href as string | undefined;
            const url = window.prompt("링크 주소", prev ?? "https://");
            if (url === null) return;
            if (!url.trim()) editor.chain().focus().unsetLink().run();
            else editor.chain().focus().setLink({ href: url.trim() }).run();
          }}
          title="링크">🔗</button>
      </BubbleMenu>

      <EditorContent editor={editor} />

      <div className={`${styles.status} ${status === "failed" ? styles.statusFail : ""}`} aria-live="polite">
        {status === "saving"
          ? <><Spinner /> 저장 중…</>
          : status === "saved"
            ? "저장됨"
            : status === "failed"
              ? "저장하지 못했습니다 — 플랜을 찾을 수 없어요. 새로고침 후 다시 시도해주세요."
              : "글을 눌러 바로 고칠 수 있어요"}
      </div>
    </div>
  );
}
