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
import { askText } from "../../components/confirm-dialog";
import { isShortCell } from "../../lib/plan-builder/table-cells";
import { restoreRangeTildes } from "../../lib/plan-builder/range-tildes";

/*
 * 표 칸이 지니는 두 가지 — 정렬(마크다운 ---: 에서 온 align, 숫자 열은 오른쪽)과 '짧은 칸' 표시.
 * 기본 TableCell 은 둘 다 버려서, 화면에서 숫자 열 정렬이 사라지고 폰에서 모든 칸을 한 줄로 늘이는 수밖에 없었다.
 * 짧은 칸(숫자·짧은 낱말)만 한 줄로 두고 줄글 칸은 줄을 바꾼다(InlineDocEditor.module.css).
 */
const cellAttributes = {
  align: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute("align") || element.style.textAlign || null,
    renderHTML: (attributes: Record<string, unknown>) => (attributes.align ? { align: attributes.align } : {}),
  },
  short: {
    default: false,
    parseHTML: (element: HTMLElement) => isShortCell(element.textContent ?? ""),
    renderHTML: (attributes: Record<string, unknown>) => (attributes.short ? { "data-short": "" } : {}),
  },
};
const PlanTableCell = TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...cellAttributes }; } });
const PlanTableHeader = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...cellAttributes }; } });

export interface InlineDocEditorProps {
  /** 초기 본문 (서버에서 렌더한 HTML) */
  html: string;
  /**
   * 편집이 멈춘 뒤 호출. HTML을 넘기며, 저장(마크다운 역변환 포함)은 상위가 맡는다.
   * 디바운스는 이 컴포넌트가 처리한다.
   */
  onChange: (html: string) => void;
  onDraft?: (html: string) => void;
  /** 저장 상태 표시용 */
  status?: "idle" | "saving" | "saved" | "failed";
  /** 디바운스(ms) */
  debounceMs?: number;
  /**
   * 읽기 전용 — 예시 문서처럼 고칠 수 없는 글.
   * 저장 계층에서 막는 것만으로는 부족하다. 화면에서 글자가 쳐지는데
   * 아무 일도 일어나지 않으면 고쳐진 줄 알고 넘어간다.
   */
  readOnly?: boolean;
}

const SAVE_DEBOUNCE = 1500;

/**
 * 문서를 늘 편집 가능한 상태로 보여주는 인라인 편집기.
 * 버튼을 눌러 '편집 모드'로 들어가지 않고, 그 자리에서 바로 고친다.
 * 글자를 선택하면 그 위에 서식 툴바가 뜬다.
 */
export default function InlineDocEditor({ html: sourceHtml, onChange, onDraft, status = "idle", debounceMs = SAVE_DEBOUNCE, readOnly = false }: InlineDocEditorProps) {
  // 예전 본문에 남은 범위 물결 취소선('2<del>3곳 … 2</del>3곳')을 물결로 되돌려 보여 준다
  const html = restoreRangeTildes(sourceHtml);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  const latestDraft = useRef(onDraft); latestDraft.current = onDraft;

  function flushPending() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current === null) return;
    const value = pending.current;
    pending.current = null;
    latest.current(value);
  }

  const editor = useEditor({
    immediatelyRender: false, // SSR과 첫 렌더가 어긋나지 않게
    extensions: [
      // 취소선은 끈다 — '2~3곳 … 각 2~3곳'의 물결이 취소선으로 바뀌어 '23곳'으로 읽혔다(lib/plan-builder/markdown.ts)
      StarterKit.configure({ link: false, strike: false }),
      Link.configure({ openOnClick: false, autolink: false }),
      Table.configure({ resizable: false }),
      TableRow,
      PlanTableHeader,
      PlanTableCell,
      ChartFigure,
    ],
    content: html,
    editable: !readOnly,
    editorProps: {
      attributes: { class: styles.surface, spellcheck: "false" },
    },
    onUpdate: ({ editor }) => {
      if (timer.current) clearTimeout(timer.current);
      pending.current = editor.getHTML();
      latestDraft.current?.(pending.current);
      timer.current = setTimeout(flushPending, debounceMs);
    },
    onBlur: flushPending,
  });

  // 읽기 전용 여부가 바뀌면 편집기에도 반영한다
  useEffect(() => {
    if (!editor) return;
    if (readOnly) flushPending();
    if (editor.isEditable === !readOnly) return;
    editor.setEditable(!readOnly, false);
  }, [readOnly, editor]);

  // 다른 섹션으로 이동하거나 다시 생성했을 때 본문 교체
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() === html) return;
    editor.commands.setContent(html, { emitUpdate: false });
  }, [html, editor]);

  // 화면을 떠나기 전 마지막 변경을 흘려보내지 않는다
  useEffect(() => {
    return () => {
      flushPending();
    };
  }, []);

  /*
   * 편집기가 준비되기 전(첫 그림)에도 같은 본문을 같은 모양으로 그려 둔다.
   * 예전에는 빈 칸이었다가 글이 한꺼번에 들어와 아래 항목을 통째로 밀어냈다(문서 화면 CLS 0.55).
   * html 은 편집기에 넣는 것과 같은 서버 렌더 본문이다(사실 고치기 화면도 같은 값을 그대로 그린다).
   */
  if (!editor) return (
    <div className={styles.wrap}>
      <div>
        <div className={`tiptap ProseMirror ${styles.surface}`} {...(readOnly ? { contentEditable: false } : {})} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      {!readOnly && <div className={styles.status} aria-hidden="true">글을 눌러 바로 고칠 수 있어요</div>}
    </div>
  );

  const btn = (active: boolean) => `${styles.tbBtn} ${active ? styles.tbOn : ""}`;

  if (readOnly) {
    return (
      <div className={styles.wrap}>
        <EditorContent editor={editor} />
      </div>
    );
  }

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
          onClick={async () => {
            const prev = editor.getAttributes("link").href as string | undefined;
            const url = await askText({ title: "링크 넣기", message: "연결할 주소를 넣어 주세요. 비우면 링크를 없애요.", label: "링크 주소", value: prev ?? "https://", type: "url", confirmLabel: "넣기" });
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
              ? "아직 서버에 저장되지 않았어요."
              : "글을 눌러 바로 고칠 수 있어요"}
      </div>
    </div>
  );
}
