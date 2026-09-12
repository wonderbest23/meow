import { MousePointer2, MoveDiagonal2 } from "lucide-react";
import type { CSSProperties } from "react";
import styles from "./home-title-editor.module.css";

const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

export function HomeTitleEditor({ title, previewTime }: { title: string; previewTime?: number }) {
  const preview = process.env.NODE_ENV === "development" && Number.isFinite(previewTime);
  const style = preview ? { "--editor-delay": `${-Math.max(0, Math.min(6.4, previewTime!))}s` } as CSSProperties : undefined;

  return <span className={styles.editor} data-title-editor data-preview={preview || undefined} style={style}>
    <span className={styles.layer}>
      <span className={styles.title}>{title}</span>
      <span className={styles.frame} aria-hidden="true">
        {handles.map(handle => <i key={handle} data-handle={handle} />)}
        <span className={styles.pivot} />
      </span>
    </span>
    <span className={styles.marquee} aria-hidden="true" />
    <span className={styles.guideVertical} aria-hidden="true" />
    <span className={styles.guideHorizontal} aria-hidden="true" />
    <span className={styles.cursor} aria-hidden="true">
      <MousePointer2 className={styles.pointer} size={27} strokeWidth={1.6} />
      <MoveDiagonal2 className={styles.resize} size={25} strokeWidth={2} />
      <span className={styles.click} />
    </span>
  </span>;
}
