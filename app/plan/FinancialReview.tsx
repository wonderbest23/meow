"use client";

import { useMemo } from "react";
import {
  describeFinancialFields,
  collectFinancialInputs,
  calculateFinancials,
  defaultGrowthPct,
  FINANCIAL_OVERRIDE_KEY,
  type FinancialField,
} from "../../lib/plan-builder/financials";
import styles from "./FinancialReview.module.css";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export interface FinancialReviewProps {
  /** 플랜 전체 답변 (현재 편집 중인 섹션 답변이 반영된 상태) */
  allAnswers: Record<string, Record<string, unknown>>;
  /** 보정값 변경 — 상위에서 저장한다 */
  onOverride: (fieldId: string, value: string) => void;
}

/**
 * 재무 수치 검토 패널.
 * 답변에서 읽어낸 금액을 그대로 보여주고, 잘못 인식했으면 사용자가 바로 고칠 수 있게 한다.
 * 여기서 확정한 값이 그대로 사업계획서의 손익표에 들어간다.
 */
export default function FinancialReview({ allAnswers, onOverride }: FinancialReviewProps) {
  const fields = useMemo(() => describeFinancialFields(allAnswers), [allAnswers]);
  const { inputs, growthLabel, staffIncluded } = useMemo(() => collectFinancialInputs(allAnswers), [allAnswers]);
  const result = useMemo(() => calculateFinancials(inputs), [inputs]);

  const overrides = allAnswers?.[FINANCIAL_OVERRIDE_KEY] ?? {};
  const growthValue = overrides.monthlyGrowthPct;
  const growthShown = growthValue != null && growthValue !== "" ? String(growthValue) : String(defaultGrowthPct(growthLabel));

  const filled = fields.filter((f) => f.value != null).length;
  const warnings = fields.filter((f) => f.warning);
  const missing = fields.filter((f) => f.value == null && f.raw == null);

  return (
    <section className={styles.wrap} aria-label="재무 수치 검토">
      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>이렇게 계산할까요?</h2>
          <p className={styles.desc}>
            답변에서 읽어낸 금액입니다. 잘못 인식한 값이 있으면 오른쪽에서 바로 고쳐주세요.
            여기서 확정한 숫자가 사업계획서의 손익표에 그대로 들어갑니다.
          </p>
        </div>
        <span className={styles.count}>
          {filled}/{fields.length} 인식
        </span>
      </header>

      {warnings.length > 0 && (
        <div className={styles.alert} role="status">
          <b>확인이 필요한 값이 {warnings.length}개 있습니다.</b>
          <ul>
            {warnings.map((f) => (
              <li key={f.id}>
                {f.label} — {f.warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.rows}>
        {fields.map((f) => (
          <Row key={f.id} field={f} onOverride={onOverride} />
        ))}

        {/* 성장률은 선택지에서 가정값을 뽑으므로 별도 행으로 노출한다 */}
        <div className={styles.row}>
          <div className={styles.rLabel}>
            월 성장률
            <span className={styles.rRaw}>{growthLabel ? `"${growthLabel}" 선택` : "미입력"}</span>
          </div>
          <div className={styles.rEdit}>
            <input
              className={styles.input}
              inputMode="decimal"
              value={growthShown}
              onChange={(e) => onOverride("monthlyGrowthPct", e.target.value)}
              aria-label="월 성장률(%)"
            />
            <span className={styles.unit}>%</span>
          </div>
        </div>
      </div>

      {missing.length > 0 && (
        <p className={styles.missing}>
          아직 답하지 않은 항목: {missing.map((f) => f.label).join(" · ")} — 비워두면 그 부분은 계산에서 빠집니다.
        </p>
      )}

      {/* 계산 결과 미리보기 */}
      {result.unit || result.yearTotal ? (
        <div className={styles.out}>
          <div className={styles.outHead}>계산 결과</div>
          <div className={styles.cards}>
            {result.unit && (
              <div className={styles.card}>
                <div className={styles.cLabel}>건당 공헌이익</div>
                <div className={styles.cValue}>{won(result.unit.contributionMargin)}</div>
                <div className={styles.cSub}>이익률 {result.unit.contributionMarginPct}%</div>
              </div>
            )}
            {result.breakEven && (
              <div className={styles.card}>
                <div className={styles.cLabel}>손익분기</div>
                <div className={styles.cValue}>월 {result.breakEven.units.toLocaleString("ko-KR")}건</div>
                <div className={styles.cSub}>매출 {won(result.breakEven.revenue)}</div>
              </div>
            )}
            {result.yearTotal && (
              <>
                <div className={styles.card}>
                  <div className={styles.cLabel}>1년 매출</div>
                  <div className={styles.cValue}>{won(result.yearTotal.revenue)}</div>
                  <div className={styles.cSub}>12개월 합계</div>
                </div>
                <div className={`${styles.card} ${result.yearTotal.operatingProfit < 0 ? styles.neg : styles.pos}`}>
                  <div className={styles.cLabel}>1년 영업손익</div>
                  <div className={styles.cValue}>{won(result.yearTotal.operatingProfit)}</div>
                  <div className={styles.cSub}>
                    {result.breakEvenMonth ? `${result.breakEvenMonth}개월차 흑자 전환` : "12개월 내 흑자 전환 없음"}
                  </div>
                </div>
              </>
            )}
          </div>
          <p className={styles.note}>
            {staffIncluded ? "월 고정비에는 인건비가 합산되어 있습니다. " : ""}
            {result.paybackMonth ? `초기 투자는 ${result.paybackMonth}개월차에 회수됩니다.` : ""}
          </p>
        </div>
      ) : (
        <p className={styles.empty}>판매가·판매 건수·변동비를 입력하면 여기에 계산 결과가 나타납니다.</p>
      )}
    </section>
  );
}

function Row({ field, onOverride }: { field: FinancialField; onOverride: (id: string, v: string) => void }) {
  const shown = field.value != null ? String(field.value) : "";
  return (
    <div className={`${styles.row} ${field.warning ? styles.warn : ""}`}>
      <div className={styles.rLabel}>
        {field.label}
        <span className={styles.rRaw}>{field.raw ? `"${field.raw}"` : "미입력"}</span>
      </div>
      <div className={styles.rEdit}>
        <input
          className={styles.input}
          inputMode="numeric"
          value={shown}
          placeholder="—"
          onChange={(e) => onOverride(field.id, e.target.value)}
          aria-label={`${field.label} 확정 금액`}
        />
        <span className={styles.unit}>{field.unit}</span>
        {field.overridden && <span className={styles.fixed}>수정함</span>}
      </div>
    </div>
  );
}
