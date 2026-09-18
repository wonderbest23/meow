/**
 * 버튼 오른쪽의 작은 화살표. 평소에는 꺾쇠(›)만 보이고, 부모 버튼에 마우스를 올리면 가로선이 자라 화살표(→)가 된다.
 * 동작은 app/globals.css의 .cta-arrow 규칙(CSS transform)이 맡고, 스크립트는 없다.
 */
export function CtaArrow({ className = "" }: { className?: string }) {
  return <svg className={`cta-arrow ${className}`.trim()} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <line className="cta-arrow__shaft" x1="7" y1="12" x2="17" y2="12" />
    <line className="cta-arrow__chev" x1="13" y1="8" x2="17" y2="12" />
    <line className="cta-arrow__chev" x1="13" y1="16" x2="17" y2="12" />
  </svg>;
}
