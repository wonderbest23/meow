import { useEffect, useState } from "react";
import { hasFinalConsonant } from "../../../lib/josa";
import type { EasySummary } from "../../../lib/plan-builder/executive-summary";
import type { FirstStep } from "../../../lib/plan-builder/first-steps";
import styles from "./EasyView.module.css";

/*
 * 쉽게 보기(대표 결정 2026-11-13) — 계획서를 처음 연 사람이 표 대신 '얼마 남나 · 얼마면 여나 · 어디부터 안전한가'를 먼저 본다.
 * 숫자는 모두 문서 돈 장과 같은 계산 값이고(executive-summary.ts easy), 사실이 아닌 줄은 그리지 않는다. 보장하는 말은 쓰지 않는다.
 */
const man = (value: number) => Math.round(Math.abs(value) / 10000).toLocaleString("ko-KR");
const num = (value: number) => value.toLocaleString("ko-KR");

/* 격려 문장 — 출처가 분명한 고전의 말을 쉬운 우리말로 옮겼다. 첫걸음을 끝낸 수만큼 다음 문장으로 넘어간다 */
const SAY = [
  ["천 리 길도 발밑의 한 걸음에서 시작됩니다.", "노자"],
  ["먼저 어떤 사람이 될지 정하고, 그다음 할 일을 하세요.", "에픽테토스"],
  ["왜 하는지 아는 사람은 어떤 어려움도 견뎌 냅니다.", "니체"],
  ["삶은 돌아봐야 이해되지만, 앞을 보고 살아야 합니다.", "키르케고르"],
];
const HEGEL = ["세상의 어떤 큰일도 열정 없이 이루어진 적이 없습니다.", "헤겔"];

/** 전체 문서 돈 장 머리 — 계산 값으로 말할 수 있는 좋은 점만. 사실이 아닌 줄은 빠지고, 하나도 없으면 그리지 않는다 */
export function GoodPoints({ easy }: { easy: EasySummary }) {
  const top = easy.cap ? easy.cap * easy.contribution - easy.fixed : 0;
  const points = [
    `한 ${easy.unit}마다 ${num(easy.contribution)}원이 남습니다. ${easy.enroll ? "수강료" : "판매가"}의 ${Math.round(easy.contribution / easy.price * 100)}%입니다.`,
    ...(easy.cap && easy.cap > easy.breakEven ? [`본전은 최대의 ${Math.round(easy.breakEven / easy.cap * 100)}%에서 끝납니다. 그 위는 모두 남는 구간입니다.`] : []),
    ...(top > 0 ? [`최대(한 달 ${num(easy.cap!)}${easy.unit})로 채우면 한 달 ${man(top)}만 원이 남습니다.`] : []),
  ];
  return <aside className={styles.good} aria-label="이 계획의 좋은 점">
    <h3>이 계획의 좋은 점</h3>
    <ul>{points.map(point => <li key={point}>{point}</li>)}</ul>
    <p className={styles.say}>어려워서 못 하는 것이 아닙니다. 하지 않아서 어려운 것입니다.<cite>세네카</cite></p>
  </aside>;
}

export default function EasyView({ easy, chapters, steps = [], planId, onDownload }: { easy: EasySummary; chapters: string[]; steps?: FirstStep[]; planId?: string | null; onDownload?: () => void }) {
  // shortcut: 끝낸 첫걸음은 이 기기에만 기억한다(localStorage), 기기 사이에 이어져야 하면 서버 저장으로 올린다
  const stepsKey = planId ? `easy-steps:${planId}` : null;
  const [doneSteps, setDoneSteps] = useState<number[]>([]);
  useEffect(() => { try { const saved = stepsKey && JSON.parse(localStorage.getItem(stepsKey) ?? "[]"); if (Array.isArray(saved)) setDoneSteps(saved.filter(item => Number.isInteger(item))); } catch { /* 못 읽으면 처음부터 */ } }, [stepsKey]);
  const toggleStep = (index: number) => setDoneSteps(current => {
    const next = current.includes(index) ? current.filter(item => item !== index) : [...current, index];
    try { if (stepsKey) localStorage.setItem(stepsKey, JSON.stringify(next)); } catch { /* 저장 못 해도 화면은 바뀐다 */ }
    return next;
  });
  const doneCount = steps.filter((_, index) => doneSteps.includes(index)).length;
  const say = steps.length ? SAY[Math.min(doneCount, SAY.length - 1)] : HEGEL;
  // 하루 환산은 돈 장과 같은 가정(월 26일, 반올림)
  const days = easy.perDay ? 26 : 1, per = easy.perDay ? "하루" : "한 달", unit = easy.unit;
  const safe = Math.max(1, Math.round(easy.breakEven / days)), cap = easy.cap ? Math.floor(easy.cap / days) : null;
  const reachable = cap != null && cap > safe;
  // 막대는 안전선 바로 위에서 시작한다 — 근거 없는 높은 숫자를 먼저 보이지 않는다
  const [sell, setSell] = useState(reachable ? safe + 1 : safe);
  const profit = (count: number) => count * days * easy.contribution - easy.fixed;
  const gain = profit(sell), short = easy.limit != null && easy.limit < 0;
  const startCard = easy.limit != null && easy.budget != null && Math.abs(easy.limit) >= 100_000;
  const keep = easy.budget != null && easy.limit != null ? easy.budget - easy.limit : 0, total = short ? keep : easy.budget ?? 0;
  // 모자라는 돈이 모은 돈의 절반을 넘으면 "조금만"이라고 하지 않는다
  const far = short && -easy.limit! > (easy.budget ?? 0) / 2;
  const less = easy.enroll ? "적게 와도" : "덜 팔려도";
  return <div className={styles.easy} aria-label="쉽게 보기">
    <div className={styles.hello}>
      <h2>{far ? "시작 전에 볼 숫자가 정리됐어요" : short ? "조금만 더 준비하면 시작할 수 있어요" : "시작할 수 있어요"}</h2>
      <p>계획서와 준비물이 다 만들어졌어요</p>
    </div>
    {reachable && <section className={styles.goal}>
      <h3>목표</h3>
      <p className={styles.big}>{per} {num(sell)}{unit}{hasFinalConsonant(unit) ? "이면" : "면"} {easy.perDay ? "한 달에 " : ""}<b data-neg={gain < 0 || undefined}>{gain < 0 ? "−" : ""}{man(gain)}</b>만 원이 남아요</p>
      <input type="range" min={1} max={cap!} value={sell} onChange={event => setSell(Number(event.target.value))} aria-label={`${per} ${easy.enroll ? "인원" : "판매량"}`} />
      <div className={styles.ticks}><span>1{unit}</span><span><b>안전선 {num(safe)}{unit}</b></span><span>최대 {num(cap!)}{unit} · {man(profit(cap!))}만 원</span></div>
      <p className={styles.small}>막대를 움직여 보세요 · 고정비와 건당 비용{easy.perDay ? "(월 26일 기준)" : ""}을 뺀 값이고, 대표님 몫은 여기서 나와요</p>
    </section>}
    <div className={styles.cards}>
      {startCard && <section>
        <h3>시작</h3><div>
        <p className={styles.big}>{far ? `${man(easy.limit!)}만 원이 더 있으면 든든해요` : short ? `${man(easy.limit!)}만 원만 더 모으면 돼요` : `${man(easy.limit!)}만 원이면 시작할 수 있어요`}</p>
        <div className={styles.split} aria-hidden="true">{short
          ? <><i style={{ width: `${easy.budget! / total * 100}%` }} /><i data-kind="short" style={{ width: `${-easy.limit! / total * 100}%` }} /></>
          : <><i style={{ width: `${easy.limit! / total * 100}%` }} /><i data-kind="keep" style={{ width: `${keep / total * 100}%` }} /></>}</div>
        <div className={styles.ticks}>{short ? <><span>모은 돈 {man(easy.budget!)}만</span><span>필요 {man(keep)}만</span></> : <><span>시작에 {man(easy.limit!)}만</span><span>남겨 둘 돈 {man(keep)}만</span></>}</div>
        <p className={styles.small}>준비금 {man(easy.budget!)}만 원 기준</p>
      </div></section>}
      <section>
        <h3>안전선</h3><div>
        <p className={styles.big}>{cap != null && !reachable ? "값을 조금 고치면 남기 시작해요" : `${per} ${easy.perDay ? "약 " : ""}${num(safe)}${unit}만 넘기면 손해가 없어요`}</p>
        {cap != null && <><div className={styles.scale} aria-hidden="true"><i style={{ width: `${Math.min(100, safe / cap * 100)}%` }} /></div>
          <div className={styles.ticks}><span>0</span><span>최대 {num(cap)}{unit}</span></div></>}
        <p className={styles.small}>{cap == null ? "여기부터는 팔수록 남아요" : reachable ? `최대의 ${Math.round(safe / cap * 100)}%만 채우면 돼요` : `지금 값으로는 본전이 ${per} ${num(safe)}${unit}라 최대(${num(cap)}${unit})보다 많아요. 전체 문서에서 가격·고정비를 고쳐 보세요`}</p>
      </div></section>
      {easy.shortfall > 0 && <section>
        <h3>여유</h3><div>
        <p className={styles.big}>{easy.limit != null && !short ? `처음 ${less} 여섯 달은 버텨요` : `${man(easy.shortfall)}만 원이 있으면 여섯 달을 버텨요`}</p>
        <p className={styles.small}>{easy.limit != null && !short ? `그만큼(${man(easy.shortfall)}만 원)은 미리 떼어 뒀어요` : `처음에 안전선의 절반만 ${easy.enroll ? "올" : "팔릴"} 때를 대비한 돈이에요`}</p>
      </div></section>}
    </div>
    {!!steps.length && <section className={styles.steps}>
      <header><h3>첫걸음</h3><span role="status">{doneCount === steps.length ? "첫걸음을 다 뗐어요" : doneCount ? `좋아요, ${steps.length - doneCount}개 남았어요` : "여기서부터 시작해요"}</span></header>
      <ol>{steps.map((step, index) => { const done = doneSteps.includes(index); return <li key={step.week + index} data-done={done || undefined}>
        <button type="button" aria-pressed={done} aria-label={`${step.week} ${done ? "했어요 취소" : "했어요"}`} onClick={() => toggleStep(index)}>{done ? "✓" : index + 1}</button>
        <div><p className={styles.meta}>{step.week}{step.time ? ` · ${step.time}` : ""}</p><p className={styles.task}>{step.task}</p>{step.done && <p className={styles.small}>끝: {step.done}</p>}</div>
      </li>; })}</ol>
    </section>}
    {!!chapters.length && <p className={styles.ready}><strong>준비된 것</strong>{chapters.join(" · ")}</p>}
    {/* 휴대폰은 머리의 내려받기를 메뉴로 옮겼다 — 돈 낸 사람이 바로 찾게 여기에도 둔다 */}
    {onDownload && <button type="button" className={styles.download} onClick={onDownload}>계획서 내려받기</button>}
    <p className={styles.say} key={say[1]}>{say[0]}<cite>{say[1]}</cite></p>
  </div>;
}
