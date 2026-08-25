"use client";

/*
 * 킷 페이지의 '손으로 짠' 모바일판.
 *
 * 킷(Brainwave.io)에는 모바일 아트보드가 없다 — 피그마 파일의 프레임 87개를 전수
 * 확인했고 전부 데스크톱 폭(844~1826px)이었다. 좌표를 기계로 재배치하는 방식은
 * "읽을 수는 있는 페이지"까지는 갔지만 "디자인된 페이지"는 되지 못했다(사용자 판정).
 *
 * 그래서 실제로 노출되는 페이지부터 모바일 레이아웃을 직접 짠다. 원칙:
 *  - 글·사진은 데스크톱과 같은 노드 id 로 읽는다(t/img) — 사용자가 편집기에서 고친
 *    문구·사진이 PC·모바일에 동시에 반영된다. 여기에 문구를 하드코딩하지 않는다.
 *  - 색·서체는 킷 팔레트를 그대로 쓴다(#161c2d 잉크 / #473bf0 포인트 / #68d585 가격).
 *  - 여기 없는 페이지는 기존 자동 재배치(MobileView)로 떨어진다.
 *
 * 새 페이지를 추가하려면: ko/ 매핑에서 노드 id 를 찾고, 여기에 컴포넌트를 더한 뒤
 * BRAINWAVE_MOBILE 에 등록한다.
 */

import type { ReactNode } from "react";
import type { BrainwavePageData, BrainwaveOverrides } from "./brainwave-page";

type Pick = (kind: "text" | "image", id: string, el: HTMLElement) => void;

export interface MobileTemplateProps {
  /** 노드 id → 현재 글(사용자 오버라이드 → 킷 원문 순) */
  t: (id: string, fallback?: string) => string;
  /** 노드 id → 현재 사진 경로 */
  img: (id: string, fallback: string) => string;
  onPick?: Pick;
}

/* ── 공용 조각 ─────────────────────────────────────────── */

function T({ id, t, onPick, as: Tag = "span", className }: { id: string; t: MobileTemplateProps["t"]; onPick?: Pick; as?: "span" | "p" | "h1" | "h2" | "h3" | "strong" | "small"; className?: string }) {
  const text = t(id);
  if (!text) return null;
  return (
    /* data-bw-text: 에디터의 편집 표시(점선 테두리·하이라이트) CSS 가 그대로 붙는다 */
    <Tag className={className} data-bw-text={onPick ? id : undefined} onClick={onPick ? (e) => onPick("text", id, e.currentTarget as HTMLElement) : undefined}>
      {text}
    </Tag>
  );
}

function Img({ id, src, img, onPick, className, alt = "" }: { id: string; src: string; img: MobileTemplateProps["img"]; onPick?: Pick; className?: string; alt?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={img(id, src)}
      alt={alt}
      loading="lazy"
      data-bw-image={onPick ? id : undefined}
      onClick={onPick ? (e) => onPick("image", id, e.currentTarget as HTMLElement) : undefined}
    />
  );
}

function Section({ className, children, dark }: { className?: string; children: ReactNode; dark?: boolean }) {
  return <section className={`bwmob-sec ${dark ? "bwmob-dark" : ""} ${className ?? ""}`}>{children}</section>;
}

/* ── 03 Coworking → 카페(새벽커피) ─────────────────────── */

function Cafe0_2226({ t, img, onPick }: MobileTemplateProps) {
  const A = "/brainwave/0-2226";
  const faq: Array<[string, string?]> = [
    ["0:2246", "0:2247"],
    ["0:2252"],
    ["0:2257"],
    ["0:2262"],
  ];
  return (
    <div className="bwmob">
      {/* 머리: 상호만 — 모바일에서 가로 메뉴는 두지 않는다 */}
      <Section dark className="bwmob-hero">
        <T id="0:2383" t={t} onPick={onPick} as="h1" className="bwmob-brand" />
        <p className="bwmob-eyebrow"><T id="0:2377" t={t} onPick={onPick} /></p>
        <h2 className="bwmob-h1">
          <T id="0:2376/0" t={t} onPick={onPick} /> <T id="0:2376/1" t={t} onPick={onPick} />
        </h2>
        {/* 예약 — 필드 두 줄 + 버튼 한 줄 */}
        <div className="bwmob-book">
          <div className="bwmob-field"><Img id="I0:2373;0:4740;0:4766/0" src={`${A}/imgPin32.svg`} img={img} className="bwmob-field-ic" /><T id="I0:2373;0:4738" t={t} onPick={onPick} /><span className="bwmob-caret" aria-hidden>▾</span></div>
          <div className="bwmob-field"><Img id="0:4778/0/0" src={`${A}/imgCalendar60.svg`} img={img} className="bwmob-field-ic" /><T id="I0:2374;0:4738" t={t} onPick={onPick} /><span className="bwmob-caret" aria-hidden>▾</span></div>
          <button type="button" className="bwmob-btn"><T id="I0:2372;0:4557" t={t} onPick={onPick} /></button>
        </div>
      </Section>

      {/* 매장 둘러보기 — 사진 + 재생 */}
      <Section dark className="bwmob-video">
        <div className="bwmob-video-shot">
          <Img id="0:2362/0/0" src={`${A}/imgAustinDistelWawEfYdpkagUnsplash1.jpg`} img={img} onPick={onPick} className="bwmob-cover" alt="매장 사진" />
          <span className="bwmob-play" aria-hidden>▶</span>
        </div>
        <p className="bwmob-video-label"><T id="0:2365" t={t} onPick={onPick} /></p>
      </Section>

      {/* 숫자 셋 */}
      <Section className="bwmob-stats">
        {([["0:2349", "0:2350"], ["0:2352", "0:2353"], ["0:2355", "0:2356"]] as const).map(([n, c]) => (
          <div key={n} className="bwmob-stat">
            <T id={n} t={t} onPick={onPick} as="strong" />
            <T id={c} t={t} onPick={onPick} as="p" />
          </div>
        ))}
      </Section>

      {/* 자주 앉는 자리 — 사진 카드 셋 */}
      <Section>
        <T id="0:2345" t={t} onPick={onPick} as="h2" className="bwmob-h2" />
        <T id="0:2346" t={t} onPick={onPick} as="p" className="bwmob-sub" />
        <div className="bwmob-cards">
          {([["0:2329/0/0", "imgBitmap1.jpg", "0:2324", "0:2325"], ["0:2336/0/0", "imgBitmap3.jpg", "0:2331", "0:2332"], ["0:2343/0/0", "imgBitmap5.jpg", "0:2338", "0:2339"]] as const).map(([iid, file, name, seats]) => (
            <div key={iid} className="bwmob-card">
              <Img id={iid} src={`${A}/${file}`} img={img} onPick={onPick} className="bwmob-card-img" alt="" />
              <div className="bwmob-card-body">
                <T id={name} t={t} onPick={onPick} as="strong" />
                <T id={seats} t={t} onPick={onPick} as="small" />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 출근길에 들르기 좋은 — 사진 + 특징 셋 */}
      <Section className="bwmob-soft">
        <h2 className="bwmob-h2"><T id="0:2312/0" t={t} onPick={onPick} /> <T id="0:2312/1" t={t} onPick={onPick} /></h2>
        <T id="0:2313" t={t} onPick={onPick} as="p" className="bwmob-sub" />
        <Img id="0:2317/0/0" src={`${A}/imgKalVisualsPfc2FY9LeGUnsplash1.jpg`} img={img} onPick={onPick} className="bwmob-photo" alt="" />
        <div className="bwmob-feats">
          {([["0:2287/0/0", "imgDeskDrawer.svg", "0:2285", "0:2286"], ["0:2296/0/0", "imgWifi.svg", "0:2294", "0:2295"], ["0:2303/0/0", "imgMug.svg", "0:2301", "0:2302"]] as const).map(([iid, file, title, body]) => (
            <div key={iid} className="bwmob-feat">
              <Img id={iid} src={`${A}/${file}`} img={img} className="bwmob-feat-ic" alt="" />
              <div>
                <T id={title} t={t} onPick={onPick} as="strong" />
                <T id={body} t={t} onPick={onPick} as="p" />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 단골이 늘어나는 이유 */}
      <Section dark>
        <T id="0:2281" t={t} onPick={onPick} as="h2" className="bwmob-h2" />
        <T id="0:2282" t={t} onPick={onPick} as="p" className="bwmob-sub" />
        <div className="bwmob-checks">
          {([["0:2269", "0:2268"], ["0:2276", "0:2275"]] as const).map(([title, body]) => (
            <div key={title} className="bwmob-check">
              <span className="bwmob-check-ic" aria-hidden>✓</span>
              <div>
                <T id={title} t={t} onPick={onPick} as="strong" />
                <T id={body} t={t} onPick={onPick} as="p" />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 소식 구독 */}
      <Section className="bwmob-soft">
        <T id="0:2237" t={t} onPick={onPick} as="h2" className="bwmob-h2" />
        <T id="0:2235" t={t} onPick={onPick} as="p" className="bwmob-sub" />
        <form className="bwmob-subscribe" onSubmit={(e) => e.preventDefault()}>
          <input type="email" placeholder={t("0:2232") || "이메일 주소"} aria-label="이메일 주소" />
          <button type="submit" className="bwmob-btn"><T id="I0:2233;0:4557" t={t} onPick={onPick} /></button>
        </form>
        <p className="bwmob-fine"><T id="0:2236/0" t={t} onPick={onPick} /> <T id="0:2236/1" t={t} onPick={onPick} /></p>
      </Section>

      {/* 자주 묻는 질문 */}
      <Section>
        <h2 className="bwmob-h2">자주 묻는 질문</h2>
        <div className="bwmob-faq">
          {faq.map(([q, a], i) => (
            <details key={q} open={i === 0}>
              <summary><T id={q} t={t} onPick={onPick} /></summary>
              {a ? <T id={a} t={t} onPick={onPick} as="p" /> : <p className="bwmob-fine">매장에서 안내해 드립니다.</p>}
            </details>
          ))}
        </div>
      </Section>

      <MobileFooter prefix="I0:2227" t={t} onPick={onPick} />
    </div>
  );
}

/* ── 06 ECommerce → 무인꽃집 ───────────────────────────── */

function Shop0_1102({ t, img, onPick }: MobileTemplateProps) {
  const A = "/brainwave/0-1102";
  const cats = [
    ["0:1332/0/0", "imgSofa.png", "0:1333", "0:1334"],
    ["0:1337/0/0", "imgBitmap12.png", "0:1338", "0:1339"],
    ["0:1342/0/0", "imgBitmap13.png", "0:1343", "0:1344"],
    ["0:1347/0/0", "imgBitmap14.png", "0:1348", "0:1349"],
    ["0:1352/0/0", "imgBitmap15.png", "0:1353", "0:1354"],
    ["0:1357/0/0", "imgTable.png", "0:1358", "0:1359"],
  ] as const;
  const goods = [
    ["0:1149/0/0/0/0", "imgBitmap2.png", "0:1164", "0:1166", null],
    ["0:1171/0/0", "imgBitmap4.png", "0:1184", "0:1186", "0:1187"],
    ["0:1192/0/0", "imgBitmap5.png", "0:1205", "0:1207", "0:1208"],
    ["0:1213/0/0", "imgBitmap6.png", "0:1226", "0:1228", "0:1229"],
    ["0:1234/0/0", "imgBitmap7.png", "0:1248", "0:1250", "0:1251"],
    ["0:1256/0/0", "imgBitmap8.png", "0:1270", "0:1272", null],
    ["0:1277/0/0", "imgBitmap9.png", "0:1290", "0:1292", null],
    ["0:1297/0/0", "imgBitmap10.png", "0:1310", "0:1312", "0:1313"],
  ] as const;
  return (
    <div className="bwmob">
      {/* 머리 — 상호 + 장바구니 */}
      <header className="bwmob-shophead">
        <T id="0:1361" t={t} onPick={onPick} as="strong" />
        <span className="bwmob-cart" aria-label="장바구니">
          <Img id="0:1364/0/0" src={`${A}/imgCartSimple.svg`} img={img} className="bwmob-cart-ic" alt="" />
          <i><T id="0:1370" t={t} onPick={onPick} /></i>
        </span>
      </header>

      {/* 히어로 — 사진 위 헤드라인 */}
      <Section className="bwmob-shophero">
        <Img id="0:1325/0/0" src={`${A}/imgBehzadGhaffarianNhWgZnv85LqUnsplash1.jpg`} img={img} onPick={onPick} className="bwmob-cover" alt="" />
        <div className="bwmob-shophero-txt">
          <p className="bwmob-eyebrow"><T id="0:1328" t={t} onPick={onPick} /></p>
          <T id="0:1327" t={t} onPick={onPick} as="h1" className="bwmob-h1" />
        </div>
      </Section>

      {/* 카테고리 — 2열 */}
      <Section>
        <div className="bwmob-cats">
          {cats.map(([iid, file, name, cnt]) => (
            <div key={iid} className="bwmob-cat">
              <Img id={iid} src={`${A}/${file}`} img={img} onPick={onPick} className="bwmob-cat-img" alt="" />
              <T id={name} t={t} onPick={onPick} as="strong" />
              <T id={cnt} t={t} onPick={onPick} as="small" />
            </div>
          ))}
        </div>
      </Section>

      {/* 오늘 들어온 꽃 — 상품 2열 */}
      <Section className="bwmob-soft">
        <div className="bwmob-row">
          <T id="0:1319" t={t} onPick={onPick} as="h2" className="bwmob-h2" />
          <T id="I0:1320;0:4626" t={t} onPick={onPick} as="small" className="bwmob-more" />
        </div>
        <div className="bwmob-goods">
          {goods.map(([iid, file, name, price, was]) => (
            <div key={iid} className="bwmob-good">
              <Img id={iid} src={`${A}/${file}`} img={img} onPick={onPick} className="bwmob-good-img" alt="" />
              <T id={name} t={t} onPick={onPick} as="strong" />
              <p className="bwmob-price">
                <T id={price} t={t} onPick={onPick} />
                {was ? <T id={was} t={t} onPick={onPick} as="small" className="bwmob-was" /> : null}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* 셀프 포장 안내 */}
      <Section>
        <Img id="0:1146/0/0" src={`${A}/imgJeanPhilippeDelbergheBa2MCCtXg2OUnsplash1.jpg`} img={img} onPick={onPick} className="bwmob-photo" alt="" />
        <T id="0:1141" t={t} onPick={onPick} as="h2" className="bwmob-h2" />
        <T id="0:1142" t={t} onPick={onPick} as="p" className="bwmob-sub" />
        <button type="button" className="bwmob-btn"><T id="I0:1140;0:4572" t={t} onPick={onPick} /></button>
      </Section>

      {/* 후기 한 편 */}
      <Section className="bwmob-soft">
        <blockquote className="bwmob-quote">
          <T id="0:1115" t={t} onPick={onPick} as="p" />
          <footer>
            <T id="I0:1127;0:4621" t={t} onPick={onPick} as="strong" /> · <T id="I0:1127;0:4622" t={t} onPick={onPick} />
          </footer>
        </blockquote>
      </Section>

      {/* 마무리 CTA */}
      <Section dark className="bwmob-cta">
        <T id="0:1111" t={t} onPick={onPick} as="h2" className="bwmob-h2" />
        <button type="button" className="bwmob-btn"><T id="I0:1110;0:4626" t={t} onPick={onPick} /></button>
      </Section>

      <MobileFooter prefix="I0:1103" t={t} onPick={onPick} />
    </div>
  );
}

/* ── 08 Consultation → 상담 서비스 (service 업종 기본 템플릿) ── */

function Consult0_290({ t, img, onPick }: MobileTemplateProps) {
  const A = "/brainwave/0-290";
  const services = [
    ["0:372/0", "imgBgCopy.png", "0:373"],
    ["0:379/0", "imgBgCopy1.jpg", "0:380"],
    ["0:386/0", "imgBgCopy2.jpg", "0:387"],
    ["0:393/0", "imgBgCopy3.jpg", "0:394"],
  ] as const;
  const steps = [
    ["0:340", "0:337", "0:336"],
    ["0:346", "0:343", "0:342"],
    ["0:352", "0:349", "0:348"],
  ] as const;
  const quotes = [
    ["0:316", "I0:317;0:4616/0", "imgOval.png", "I0:317;0:4618", "I0:317;0:4617"],
    ["0:320", "I0:321;0:4616/0", "imgOval1.png", "I0:321;0:4618", "I0:321;0:4617"],
    ["0:324", "I0:325;0:4616/0", "imgOval2.png", "I0:325;0:4618", "I0:325;0:4617"],
  ] as const;
  const fields = [
    ["I0:303;0:4582", "I0:303;0:4581", "text"],
    ["I0:304;0:4582", "I0:304;0:4581", "email"],
    ["I0:305;0:4582", "I0:305;0:4581", "tel"],
  ] as const;
  return (
    <div className="bwmob">
      {/* 머리 — 상호만 */}
      <header className="bwmob-shophead">
        <T id="0:418" t={t} onPick={onPick} as="strong" />
      </header>

      {/* 히어로 — 배경 사진 위 헤드라인 + 버튼 */}
      <Section className="bwmob-shophero">
        <Img id="0:411/0" src={`${A}/imgBg.jpg`} img={img} onPick={onPick} className="bwmob-cover bwmob-cover-tall" alt="" />
        <div className="bwmob-shophero-txt">
          <T id="0:414" t={t} onPick={onPick} as="h1" className="bwmob-h1" />
          <T id="0:415" t={t} onPick={onPick} as="p" className="bwmob-herosub" />
          <button type="button" className="bwmob-btn"><T id="I0:416;0:4460" t={t} onPick={onPick} /></button>
        </div>
      </Section>

      {/* 숫자 셋 */}
      <Section className="bwmob-stats">
        {([["0:400", "0:401"], ["0:403", "0:404"], ["0:406", "0:407"]] as const).map(([n, c]) => (
          <div key={n} className="bwmob-stat">
            <T id={n} t={t} onPick={onPick} as="strong" />
            <T id={c} t={t} onPick={onPick} as="p" />
          </div>
        ))}
      </Section>

      {/* 제공 서비스 — 사진 카드 넷 */}
      <Section className="bwmob-soft">
        <T id="0:397" t={t} onPick={onPick} as="h2" className="bwmob-h2" />
        <T id="0:396" t={t} onPick={onPick} as="p" className="bwmob-sub" />
        <div className="bwmob-cards">
          {services.map(([iid, file, name]) => (
            <div key={iid} className="bwmob-card">
              <Img id={iid} src={`${A}/${file}`} img={img} onPick={onPick} className="bwmob-card-img" alt="" />
              <div className="bwmob-card-body">
                <T id={name} t={t} onPick={onPick} as="strong" />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 이용 순서 — 1·2·3 */}
      <Section>
        <T id="0:365" t={t} onPick={onPick} as="h2" className="bwmob-h2" />
        <T id="0:364" t={t} onPick={onPick} as="p" className="bwmob-sub" />
        <Img id="0:357/0/0" src={`${A}/imgBitmap1.jpg`} img={img} onPick={onPick} className="bwmob-photo" alt="" />
        <div className="bwmob-steps">
          {steps.map(([num, title, body]) => (
            <div key={num} className="bwmob-step">
              <T id={num} t={t} onPick={onPick} as="span" className="bwmob-step-num" />
              <div>
                <T id={title} t={t} onPick={onPick} as="strong" />
                <T id={body} t={t} onPick={onPick} as="p" />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 알림 줄 — 배지 + 한 문장 */}
      <Section className="bwmob-soft bwmob-noticewrap">
        <p className="bwmob-notice">
          <T id="I0:330;0:4592" t={t} onPick={onPick} as="span" className="bwmob-badge" />
          <T id="0:329/0" t={t} onPick={onPick} /> <T id="0:329/1" t={t} onPick={onPick} as="strong" /><T id="0:329/2" t={t} onPick={onPick} />
        </p>
      </Section>

      {/* 이용 후기 셋 */}
      <Section dark>
        <div className="bwmob-quotes">
          {quotes.map(([body, ava, file, name, role]) => (
            <blockquote key={body} className="bwmob-quote">
              <T id={body} t={t} onPick={onPick} as="p" />
              <footer>
                <Img id={ava} src={`${A}/${file}`} img={img} onPick={onPick} className="bwmob-quote-ava" alt="" />
                <T id={name} t={t} onPick={onPick} as="strong" /> · <T id={role} t={t} onPick={onPick} />
              </footer>
            </blockquote>
          ))}
        </div>
      </Section>

      {/* 상담 신청 폼 */}
      <Section className="bwmob-soft">
        <T id="0:309" t={t} onPick={onPick} as="h2" className="bwmob-h2" />
        <T id="0:308" t={t} onPick={onPick} as="p" className="bwmob-sub" />
        <form className="bwmob-form" onSubmit={(e) => e.preventDefault()}>
          {fields.map(([label, ph, type]) => (
            <label key={label} className="bwmob-formfield">
              <T id={label} t={t} onPick={onPick} as="small" />
              <input type={type} placeholder={t(ph)} />
            </label>
          ))}
          <label className="bwmob-formfield">
            <T id="I0:306;0:4718" t={t} onPick={onPick} as="small" />
            <input type="text" placeholder={t("I0:306;0:4717")} />
          </label>
          <button type="submit" className="bwmob-btn"><T id="I0:302;0:4557" t={t} onPick={onPick} /></button>
        </form>
      </Section>

      {/* 소식 구독 */}
      <Section dark className="bwmob-cta">
        <T id="0:294" t={t} onPick={onPick} as="h2" className="bwmob-h2" />
        <form className="bwmob-subscribe" onSubmit={(e) => e.preventDefault()}>
          <input type="email" placeholder={t("I0:296;0:4597") || "이메일 주소"} aria-label="이메일 주소" />
          <button type="submit" className="bwmob-btn"><T id="I0:295;0:4460" t={t} onPick={onPick} /></button>
        </form>
      </Section>

      <MobileFooter prefix="I0:291" t={t} onPick={onPick} />
    </div>
  );
}

/* ── 공용 푸터 — 세 페이지 모두 킷의 같은 푸터 인스턴스를 쓴다 ── */

function MobileFooter({ prefix, t, onPick }: { prefix: string; t: MobileTemplateProps["t"]; onPick?: Pick }) {
  const P = (suffix: string) => `${prefix};${suffix}`;
  const groups: Array<[string, string[]]> = [
    [P("0:4515"), ["0:4516/0", "0:4516/1", "0:4516/2", "0:4516/3"].map(P)],
    [P("0:4518"), ["0:4519/0", "0:4519/1", "0:4519/2", "0:4519/3", "0:4519/4"].map(P)],
    [P("0:4521"), ["0:4522/0", "0:4522/1", "0:4522/2", "0:4522/3"].map(P)],
    [P("0:4524"), ["0:4525/0", "0:4525/1", "0:4525/2"].map(P)],
  ];
  return (
    <footer className="bwmob-footer">
      <div className="bwmob-footer-grid">
        {groups.map(([head, links]) => (
          <div key={head} className="bwmob-footer-col">
            <T id={head} t={t} onPick={onPick} as="strong" />
            {links.map((l) => <T key={l} id={l} t={t} onPick={onPick} as="p" />)}
          </div>
        ))}
      </div>
      <p className="bwmob-footer-contact">
        <T id={P("0:4527")} t={t} onPick={onPick} as="strong" />{" "}
        <T id={P("0:4528/0/0")} t={t} onPick={onPick} /><T id={P("0:4528/0/1")} t={t} onPick={onPick} /> · <T id={P("0:4528/1")} t={t} onPick={onPick} />
      </p>
      <p className="bwmob-fine"><T id={P("0:4549")} t={t} onPick={onPick} /></p>
    </footer>
  );
}

/* ── 등록부 — 여기 없는 페이지는 자동 재배치로 ── */

export const BRAINWAVE_MOBILE: Record<string, (p: MobileTemplateProps) => ReactNode> = {
  "0-2226": Cafe0_2226,
  "0-1102": Shop0_1102,
  "0-290": Consult0_290,
};

/** BrainwaveStage 가 쓰는 결합부 — 오버라이드 → 킷 원문 순으로 글을 찾는다 */
export function renderBrainwaveMobile(
  page: BrainwavePageData,
  overrides: BrainwaveOverrides | undefined,
  onPick: Pick | undefined,
): ReactNode | null {
  const Template = BRAINWAVE_MOBILE[page.id];
  if (!Template) return null;
  const originals = new Map(page.slots.text.map((s) => [s.id, s.text]));
  const t = (id: string, fallback = "") => overrides?.texts?.[id] ?? originals.get(id) ?? fallback;
  const img = (id: string, fallback: string) => overrides?.images?.[id] ?? fallback;
  return <Template t={t} img={img} onPick={onPick} />;
}
