"use client";

import { PACKAGE_AMOUNT, REGEN_INCLUDED } from "../lib/payments/domain";
import styles from "./home-service-overview.module.css";

export function HomeServiceOverview({ onStart }: { onStart: () => void }) {
  return <div className={styles.overview}>
    <section className={styles.section} id="how" aria-labelledby="home-how-title">
      <header className={styles.heading}>
        <span>이렇게 시작해요</span>
        <h2 id="home-how-title">이야기하고, 다듬고, 계획으로.</h2>
      </header>
      <ol className={styles.steps}>
        <li><span className={styles.number}>1</span><h3>생각을 이야기해요</h3><p>막연한 관심사부터 운영 중인 사업의 고민까지, 대화로 시작해요.</p></li>
        <li><span className={styles.number}>2</span><h3>내 사업안을 다듬어요</h3><p>상품·고객·비용을 확인하고, 직접 고치거나 AI와 함께 구체화해요.</p></li>
        <li><span className={styles.number}>3</span><h3>계획서로 이어가요</h3><p>정리한 사업안으로 문서를 만들고, 내 사업에서 자료와 다음 할 일을 확인해요.</p></li>
      </ol>
    </section>

    <section className={styles.difference} id="difference" aria-labelledby="home-difference-title">
      <div className={styles.section}>
        <header className={styles.heading}>
          <span>그냥 AI에게 물어보는 것과 무엇이 다른가요?</span>
          <h2 id="home-difference-title">“챗GPT로 사업계획서 쓰면<br />되는 것 아닌가요?”</h2>
          <p>오늘창업도 AI를 사용해요. 차이는 모델 이름보다,<br className={styles.desktopBreak} /> 대화 이후의 정리·수정·문서 관리를 연결한 데 있어요.</p>
        </header>
        <div className={styles.differenceRows}>
          <article><span className={styles.keyword}>사업별 정리</span><div><h3>긴 대화가 내 사업안으로 남아요</h3><p>상품, 고객, 비용, 시작 방법을 항목별로 모아요. 다시 들어와도 같은 사업을 이어서 다듬어요.</p></div></article>
          <article><span className={styles.keyword}>수정 연결</span><div><h3>무엇을 고쳤는지 놓치지 않아요</h3><p>직접 수정한 사업 정보는 저장하고, 기존 계획서에 반영이 필요한지 표시해요.</p></div></article>
          <article><span className={styles.keyword}>계획과 실적 구분</span><div><h3>예상 숫자와 실제 실적을 구분해요</h3><p>입력한 조건으로 비용과 손익을 계산하고, AI가 제안한 값은 가정으로 다뤄요. 실제 견적과 고객 반응은 따로 확인해야 해요.</p></div></article>
        </div>
      </div>
    </section>

    <section className={styles.section} id="deliverables" aria-labelledby="home-results-title">
      <header className={styles.heading}>
        <span>대화 다음에 남는 것</span>
        <h2 id="home-results-title">읽고, 고치고, 꺼내 쓰는<br />내 사업 자료.</h2>
      </header>
      <div className={styles.results}>
        <article><h3>사업계획서</h3><p>사업 소개부터 상품·고객·비용·운영까지.</p><div className={styles.formats}><span>PDF</span><span>수정 가능한 Word</span></div></article>
        <article><h3>발표자료</h3><p>완성한 계획서를 바탕으로 발표용 자료를 만들어요.</p><div className={styles.formats}><span>PPT</span></div></article>
        <article><h3>내 사업 관리</h3><p>사업안과 문서 상태를 확인하고, 대화와 다음 할 일을 이어가요.</p><div className={styles.formats}><span>사업별 작업 공간</span></div></article>
      </div>
      <p className={styles.note}>전체 문서 생성과 파일 내려받기는 결제 후 이용해요. 결과물은 검토·수정해서 사용하는 AI 초안이에요.</p>
    </section>

    <section className={`${styles.section} ${styles.usage}`} id="price" aria-labelledby="home-usage-title">
      <header className={styles.heading}><span>이용 안내</span><h2 id="home-usage-title">시작 전에 궁금한 것.</h2></header>
      <div className={styles.faq}>
        <details><summary>아이디어가 없거나 이미 사업 중이어도 되나요?</summary><p>네. 관심 있는 일, 해 본 일, 지금 사업에서 바꾸고 싶은 점을 이야기해 주세요. 사업자등록 없이도 사업안을 기획할 수 있어요.</p></details>
        <details><summary>어디까지 무료이고, 언제 결제하나요?</summary><p>로그인 후 계정당 최대 3개 문서에서 앞 2개 항목을 무료로 생성할 수 있어요. 전체 문서 생성과 PDF·Word·PPT 내려받기는 문서 1부당 {PACKAGE_AMOUNT.toLocaleString("ko-KR")}원 결제 후 이용해요. 섹션 다시 생성 {REGEN_INCLUDED}회가 포함되며, 최종 금액과 제공 범위는 결제 화면에서 확인해 주세요.</p></details>
        <details><summary>완성한 내용을 그대로 제출해도 되나요?</summary><p>내용과 수치를 직접 확인한 뒤 사용해 주세요. 시장 조사나 전문가 검토를 대신하지 않으며, 지원사업 제출 적합성이나 사업 성공을 보장하지 않아요.</p></details>
        <details><summary>홈페이지 제작이나 사업자등록도 자동으로 되나요?</summary><p>현재 중심 기능은 사업 기획, 문서 제작, 사업별 자료 관리예요. 홈페이지 제작 등 추가 작업은 필요한 범위를 따로 확인하며, 사업자등록·세무·계약이 자동으로 완료되는 서비스는 아니에요.</p></details>
      </div>
      <div className={styles.actions}><button type="button" onClick={onStart}>대화로 시작하기</button><a href="/plan">내 사업 이어가기</a></div>
    </section>
  </div>;
}
