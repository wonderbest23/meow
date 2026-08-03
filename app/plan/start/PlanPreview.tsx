"use client";

import Link from "next/link";
import { chaptersForType } from "../../../lib/plan-builder/blueprint";
import { calculateFinancials } from "../../../lib/plan-builder/financials";
import { buildCumulativeChart, chartToSvg } from "../../../lib/plan-builder/chart";
import styles from "./PlanPreview.module.css";

/*
 * 로그인 전에 보는 미리보기.
 * 예전에는 '시작하기'를 누르면 곧바로 로그인 화면이 떴다.
 * 무엇을 만들어 주는지 모르는 채로 가입하라는 말부터 들으면 돌아설 수밖에 없다.
 *
 * 여기 숫자와 목차는 실제 설계(blueprint)와 실제 계산기(financials)에서 가져온다.
 * 홍보 문구를 따로 적어두면 제품이 바뀔 때 조용히 거짓말이 된다.
 */

const PLAN_TYPE = "사업계획서";

/** 미리보기용 예시 사업 — 계산 방식을 보여주려는 것이지 특정 업종을 뜻하지 않는다 */
const SAMPLE = {
  unitPrice: 4900,
  unitVariableCost: 1800,
  monthlyFixedCost: 4_000_000,
  startingVolume: 1500,
  monthlyGrowthPct: 5,
  initialInvestment: 26_000_000,
};

function won(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

export default function PlanPreview({
  price,
  freeLabels,
}: {
  price?: number;
  freeLabels?: string[];
}) {
  const chapters = chaptersForType(PLAN_TYPE);
  const sections = chapters.flatMap((c) => c.sections);
  const minutes = sections.reduce((sum, s) => sum + s.estMinutes, 0);

  const fin = calculateFinancials(SAMPLE);
  const chart = buildCumulativeChart(fin);
  const free = new Set(freeLabels ?? []);

  return (
    <div className={styles.wrap}>
      <span className={styles.eyebrow}>미리보기</span>
      <h1 className={styles.h1}>무엇이 만들어지는지 먼저 보세요</h1>
      <p className={styles.lead}>
        질문에 답하면 사업계획서 한 부가 완성됩니다. 답변에 적은 숫자로 재무를 직접 계산하고,
        표와 그래프까지 넣어 PDF·Word로 내려받을 수 있게 만들어 드립니다.
      </p>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <b className={styles.statNum}>{chapters.length}</b>
          <span className={styles.statLabel}>챕터</span>
        </div>
        <div className={styles.stat}>
          <b className={styles.statNum}>{sections.length}</b>
          <span className={styles.statLabel}>섹션</span>
        </div>
        <div className={styles.stat}>
          <b className={styles.statNum}>약 {Math.round(minutes / 10) * 10}분</b>
          <span className={styles.statLabel}>예상 작성 시간</span>
        </div>
      </div>

      <div className={styles.block}>
        <h2 className={styles.sectionTitle}>이런 목차로 채워집니다</h2>
        <p className={styles.sectionNote}>
          {free.size > 0
            ? `초록색으로 표시한 ${free.size}개 섹션은 결제 없이 먼저 써보실 수 있습니다.`
            : "각 섹션마다 필요한 것만 묻고, 답을 본문으로 옮겨 드립니다."}
        </p>
        <div className={styles.chapters}>
          {chapters.map((chapter, ci) => (
            <div key={chapter.id} className={styles.chapter}>
              <div className={styles.chapterHead}>
                <span className={styles.chapterNum}>{ci + 1}</span>
                <span className={styles.chapterName}>{chapter.title}</span>
                <span className={styles.chapterCount}>{chapter.sections.length}개 섹션</span>
              </div>
              <div className={styles.chips}>
                {chapter.sections.map((section, si) => {
                  const label = `${ci + 1}.${si + 1} ${section.title}`;
                  const isFree = free.has(label) || free.has(section.title);
                  return (
                    <span key={section.id} className={`${styles.chip} ${isFree ? styles.chipFree : ""}`}>
                      {label}
                      {isFree ? " · 무료" : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.block}>
        <h2 className={styles.sectionTitle}>재무는 추정이 아니라 계산합니다</h2>
        <p className={styles.sectionNote}>
          판매가·변동비·고정비를 적으면 공헌이익, 손익분기, 12개월 손익표와 누적 손익 그래프가 산식으로 나옵니다.
        </p>
        <div className={styles.sample}>
          <span className={styles.sampleTag}>예시 · 판매가 {won(SAMPLE.unitPrice)}, 변동비 {won(SAMPLE.unitVariableCost)}, 월 고정비 {won(SAMPLE.monthlyFixedCost)}</span>
          <div className={styles.figures}>
            {fin.unit ? (
              <div className={styles.figure}>
                <span>건당 공헌이익</span>
                <b>{won(fin.unit.contributionMargin)}</b>
              </div>
            ) : null}
            {fin.breakEven ? (
              <div className={styles.figure}>
                <span>손익분기</span>
                <b>월 {fin.breakEven.units.toLocaleString("ko-KR")}건</b>
              </div>
            ) : null}
            {fin.yearTotal ? (
              <div className={styles.figure}>
                <span>12개월 매출</span>
                <b>{won(fin.yearTotal.revenue)}</b>
              </div>
            ) : null}
            {fin.breakEvenMonth ? (
              <div className={styles.figure}>
                <span>월 흑자 전환</span>
                <b>{fin.breakEvenMonth}개월차</b>
              </div>
            ) : null}
          </div>
          {chart ? (
            <div className={styles.chart} dangerouslySetInnerHTML={{ __html: chartToSvg(chart) }} />
          ) : null}
        </div>
      </div>

      <div className={styles.block}>
        <h2 className={styles.sectionTitle}>완성하면 이렇게 받습니다</h2>
        <div className={styles.outputs}>
          <div className={styles.output}>
            <strong>PDF</strong>
            <p>표지·목차·본문을 갖춘 한 부. 그대로 제출할 수 있는 형태입니다.</p>
          </div>
          <div className={styles.output}>
            <strong>Word</strong>
            <p>제목 스타일과 표가 살아 있어 원하는 대로 고쳐 쓸 수 있습니다.</p>
          </div>
          <div className={styles.output}>
            <strong>발표용 PPT</strong>
            <p>완성한 내용을 발표 어법으로 다시 써서 슬라이드로 만들어 드립니다.</p>
          </div>
        </div>
      </div>

      <div className={styles.cta}>
        <h2 className={styles.ctaTitle}>가입하고 시작하세요</h2>
        <p className={styles.ctaDesc}>
          {freeLabels && freeLabels.length > 0 ? (
            <><b>{freeLabels.join(", ")}</b>까지는 결제 없이 써보실 수 있습니다.</>
          ) : (
            <>앞부분은 결제 없이 써보실 수 있습니다.</>
          )}
          <br />
          작성한 내용은 계정에 저장돼 어느 기기에서든 이어서 쓸 수 있습니다.
        </p>
        <Link href="/account?next=%2Fplan%2Fstart" className={styles.ctaBtn}>
          로그인 · 회원가입
        </Link>
        {price ? (
          <p className={styles.ctaNote}>전체 섹션 열기 {price.toLocaleString("ko-KR")}원 · 1회 결제</p>
        ) : null}
      </div>
    </div>
  );
}
