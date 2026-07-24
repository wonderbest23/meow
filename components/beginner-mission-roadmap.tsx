"use client";

import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  CircleHelp,
  Clock3,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Landmark,
  LoaderCircle,
  MapPin,
  Palette,
  Presentation,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ProjectRecord } from "../lib/service-domain";
import type {
  LaunchMission,
  LaunchMissionContext,
  LaunchMissionStatus,
  LaunchMissionWorkspace,
  MissionPhase,
  SpaceQuote,
  SupportOptionId,
} from "../lib/launch-missions/domain";
import {
  buildLaunchMissions,
  createLaunchMissionWorkspace,
  missionDependenciesDone,
  missionDueDate,
  nextReadyRequiredMission,
  progressForMission,
  quoteIsContractReady,
  quoteMonthlyTotal,
} from "../lib/launch-missions/engine";
import { downloadBusinessDocuments } from "../lib/delivery/client-download";

type OpportunitySummary = {
  title: string;
  oneLiner: string;
  customer: string;
  model: string;
  revenue: string;
  risk: string;
};

type MissionView = "today" | "roadmap" | "space" | "support";

const phaseMeta: Record<MissionPhase, { label: string; range: string }> = {
  validate: { label: "검증", range: "D+0-5" },
  place: { label: "사업장", range: "D+5-12" },
  register: { label: "등록·세무", range: "D+12-17" },
  brand: { label: "이름·홍보 자료", range: "D+15-20" },
  launch: { label: "첫 매출", range: "D+20-30" },
  operate: { label: "반복 운영", range: "매월·분기" },
};

const statusLabels: Record<LaunchMissionStatus, string> = {
  todo: "시작 전",
  doing: "진행 중",
  blocked: "도움 필요",
  done: "확인 자료 완료",
};

const workplaceLabels: Record<SpaceQuote["optionType"], string> = {
  home: "자택",
  soho: "비상주·소호",
  shared_office: "공유오피스",
  commercial_lease: "상가·사무실",
  factory: "공장·작업장",
};

const supportOptions: Array<{
  id: SupportOptionId;
  title: string;
  scope: string;
  pricing: string;
  role: string;
}> = [
  {
    id: "brand-review",
    title: "홈페이지 디자인 맡기기",
    scope: "자동 제작된 판매 페이지를 바탕으로 로고, 이미지, 화면 구성과 추가 기능의 제작 범위를 정합니다.",
    pricing: "선택 옵션 · 화면 수와 수정 횟수 확정 후 견적",
    role: "홈페이지 디자인 담당자",
  },
];

type LogoStyle = LaunchMissionWorkspace["brand"]["markStyle"];

const logoStyleOptions: Array<{ id: LogoStyle; label: string; note: string }> = [
  { id: "wordmark", label: "간결한 선", note: "서비스·상담" },
  { id: "monogram", label: "첫 글자", note: "개인 브랜드" },
  { id: "badge", label: "원형 도장", note: "지역 매장" },
  { id: "spark", label: "반짝 표식", note: "교육·창작" },
  { id: "frame", label: "프레임", note: "제품·공간" },
  { id: "arch", label: "아치", note: "돌봄·생활" },
];

function contextFromProject(
  project: ProjectRecord | null,
  opportunity: OpportunitySummary,
  demo: boolean,
): LaunchMissionContext {
  const setup = project?.businessSetup;
  return {
    projectId: project?.id ?? "paid-report-demo",
    title: opportunity.title,
    region: setup?.region ?? "서울특별시",
    archetype: setup?.archetype ?? "professional_service",
    legalForm: setup?.legalForm ?? "undecided",
    workplaceType: setup?.workplaceType ?? (demo ? "soho" : "home"),
    employeeCount: setup?.employeeCount ?? 0,
    onlineSales: setup?.onlineSales ?? true,
    handlesPersonalData: setup?.handlesPersonalData ?? true,
    hasPermitBlocker: Boolean(project?.businessAssessment?.hardBlockCount),
    risk: opportunity.risk,
  };
}

function formatWon(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function logoSymbolMarkup(style: LogoStyle, color: string, initials: string) {
  const text = escapeXml(initials);
  if (style === "monogram") return `<rect x="20" y="20" width="140" height="140" rx="30" fill="${color}"/><text x="90" y="109" text-anchor="middle" font-family="Arial,sans-serif" font-size="50" font-weight="700" fill="white">${text}</text>`;
  if (style === "badge") return `<circle cx="90" cy="90" r="68" fill="${color}"/><circle cx="90" cy="90" r="53" fill="none" stroke="white" stroke-width="3"/><text x="90" y="108" text-anchor="middle" font-family="Arial,sans-serif" font-size="47" font-weight="700" fill="white">${text}</text>`;
  if (style === "spark") return `<path d="M90 18 105 69 156 84 105 99 90 150 75 99 24 84 75 69Z" fill="${color}"/><circle cx="142" cy="34" r="12" fill="#16231d"/>`;
  if (style === "frame") return `<rect x="24" y="24" width="132" height="132" rx="24" fill="none" stroke="${color}" stroke-width="13"/><rect x="58" y="58" width="64" height="64" rx="14" fill="${color}"/><circle cx="136" cy="44" r="9" fill="#16231d"/>`;
  if (style === "arch") return `<path d="M30 150V84C30 47 57 22 90 22s60 25 60 62v66h-34V86c0-18-11-31-26-31S64 68 64 86v64Z" fill="${color}"/><circle cx="90" cy="100" r="18" fill="#16231d"/>`;
  return `<rect x="28" y="48" width="34" height="84" rx="17" fill="${color}"/><rect x="73" y="26" width="34" height="106" rx="17" fill="#16231d"/><rect x="118" y="68" width="34" height="64" rx="17" fill="${color}"/>`;
}

function createLogoSymbolSvg(style: LogoStyle, color: string, initials: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 180 180"><rect width="180" height="180" fill="white"/>${logoSymbolMarkup(style, color, initials)}</svg>`;
}

async function imageDataUrlFromSvg(svg: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("로고 시안을 이미지로 바꾸지 못했습니다."));
    });
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("로고 이미지 도구를 열지 못했습니다.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function compressGeneratedLogo(dataUrl: string) {
  const image = new Image();
  image.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("생성된 로고 이미지를 읽지 못했습니다."));
  });
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("로고 이미지 도구를 열지 못했습니다.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 720, 720);
  context.drawImage(image, 0, 0, 720, 720);
  return canvas.toDataURL("image/jpeg", 0.86);
}

function downloadBlob(body: Blob, filename: string) {
  const url = URL.createObjectURL(body);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function missionRequirementLabel(mission: LaunchMission) {
  if (mission.id === "customer-evidence") return "추천 · 건너뛰기 가능";
  if (mission.requirement === "optional") return "선택";
  if (mission.requirement === "conditional") return "해당 사업만 확인";
  return "실제 영업 전 확인";
}

export function BeginnerMissionRoadmap({
  project,
  opportunity,
  brandName,
  sellingPrice,
  demo = false,
  onLogoCreated,
  onGoToDocuments,
}: {
  project: ProjectRecord | null;
  opportunity: OpportunitySummary;
  brandName: string;
  sellingPrice: number;
  demo?: boolean;
  onLogoCreated?: (logoImageUrl: string) => void | Promise<void>;
  onGoToDocuments?: () => void;
}) {
  const context = useMemo(
    () => contextFromProject(project, opportunity, demo),
    [demo, opportunity, project],
  );
  const missions = useMemo(() => buildLaunchMissions(context), [context]);
  const [workspace, setWorkspace] = useState<LaunchMissionWorkspace>(() => {
    const initial = project?.launchMissionWorkspace ?? createLaunchMissionWorkspace(context, brandName, opportunity.oneLiner);
    return {
      ...initial,
      selectedSupportOptions: initial.selectedSupportOptions.filter((option) => option === "brand-review"),
    };
  });
  const [activeView, setActiveView] = useState<MissionView>("today");
  const [phase, setPhase] = useState<MissionPhase>("validate");
  const [selectedMissionId, setSelectedMissionId] = useState(missions[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [deckState, setDeckState] = useState<"idle" | "building">("idle");
  const [logoState, setLogoState] = useState<"idle" | "generating" | "applying">("idle");
  const [logoDirection, setLogoDirection] = useState("");
  const [generatedLogo, setGeneratedLogo] = useState("");
  const [logoMessage, setLogoMessage] = useState("");

  useEffect(() => {
    if (!demo) return;
    try {
      const saved = window.localStorage.getItem("venture-beginner-missions-demo");
      if (saved) setWorkspace(JSON.parse(saved) as LaunchMissionWorkspace);
    } catch {
      window.localStorage.removeItem("venture-beginner-missions-demo");
    }
  }, [demo]);

  const selectedMission = missions.find((mission) => mission.id === selectedMissionId) ?? missions[0];
  const requiredMissions = missions.filter((mission) => mission.requirement !== "optional");
  const doneCount = requiredMissions.filter((mission) => progressForMission(workspace, mission.id).status === "done").length;
  const progressPercent = requiredMissions.length ? Math.round((doneCount / requiredMissions.length) * 100) : 0;
  const dependenciesDone = (mission: LaunchMission) => missionDependenciesDone(mission, workspace);
  const currentMission = nextReadyRequiredMission(missions, workspace);
  const readyQuotes = workspace.spaceQuotes.filter(quoteIsContractReady);
  const recommendedQuote = [...readyQuotes].sort((a, b) => quoteMonthlyTotal(a) - quoteMonthlyTotal(b))[0];

  const updateWorkspace = (next: LaunchMissionWorkspace) => {
    setWorkspace({ ...next, updatedAt: new Date().toISOString() });
    setSaveState("idle");
    setMessage("저장되지 않은 변경사항이 있습니다.");
  };

  const persistWorkspace = async (
    workspaceToSave: LaunchMissionWorkspace,
    successMessage?: string,
  ) => {
    setSaveState("saving");
    setMessage("");
    const next = { ...workspaceToSave, updatedAt: new Date().toISOString() };
    setWorkspace(next);
    try {
      if (demo) {
        window.localStorage.setItem("venture-beginner-missions-demo", JSON.stringify(next));
      } else if (project) {
        const response = await fetch(`/api/projects/${project.id}/missions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "실행 미션을 저장하지 못했습니다.");
        setWorkspace(payload.workspace);
      }
      setSaveState("saved");
      setMessage(successMessage ?? (demo ? "입력한 내용을 이 브라우저에 저장했습니다." : "입력한 내용을 프로젝트에 저장했습니다."));
      return next;
    } catch (error) {
      setSaveState("idle");
      setMessage(error instanceof Error ? error.message : "실행 미션을 저장하지 못했습니다.");
      return null;
    }
  };

  const saveWorkspace = () => persistWorkspace(workspace);

  const selectMission = (mission: LaunchMission) => {
    setSelectedMissionId(mission.id);
    setPhase(mission.phase);
  };

  const updateMissionProgress = (
    mission: LaunchMission,
    patch: Partial<{ status: LaunchMissionStatus; evidence: string; note: string }>,
  ) => {
    const current = progressForMission(workspace, mission.id);
    const next = {
      ...workspace,
      missionProgress: {
        ...workspace.missionProgress,
        [mission.id]: {
          ...current,
          ...patch,
          status: patch.status ?? (
            patch.evidence !== undefined && patch.evidence.trim() && current.status === "todo"
              ? "doing"
              : current.status
          ),
          updatedAt: new Date().toISOString(),
        },
      },
    };
    updateWorkspace(next);
    return next;
  };

  const finishMission = async (mission: LaunchMission) => {
    const progress = progressForMission(workspace, mission.id);
    const missingDependencies = mission.dependencies
      .map((id) => missions.find((entry) => entry.id === id))
      .filter((entry): entry is LaunchMission => Boolean(entry))
      .filter((entry) => progressForMission(workspace, entry.id).status !== "done");
    if (missingDependencies.length) {
      setMessage(`먼저 완료할 미션: ${missingDependencies.map((entry) => entry.title).join(" · ")}`);
      selectMission(missingDependencies[0]);
      return;
    }
    if (!progress.evidence.trim()) {
      setMessage("완료하려면 아래 확인 자료 칸에 문서명, 접수번호, 확인일 또는 인터넷 주소를 남겨주세요.");
      selectMission(mission);
      return;
    }
    const completedWorkspace: LaunchMissionWorkspace = {
      ...workspace,
      missionProgress: {
        ...workspace.missionProgress,
        [mission.id]: {
          ...progress,
          status: "done",
          updatedAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date().toISOString(),
    };
    const upcoming = nextReadyRequiredMission(missions, completedWorkspace);
    const saved = await persistWorkspace(
      completedWorkspace,
      upcoming
        ? `저장 완료 · 입력한 확인 자료가 다음 단계에 반영되었습니다. 다음 할 일: ${upcoming.title}`
        : "저장 완료 · 영업 전 확인을 모두 마쳤습니다. 최종 결과물은 언제든 확인할 수 있습니다.",
    );
    if (!saved || !upcoming) return;
    selectMission(upcoming);
  };

  const updateQuote = (index: number, patch: Partial<SpaceQuote>) => {
    updateWorkspace({
      ...workspace,
      spaceQuotes: workspace.spaceQuotes.map((quote, quoteIndex) => quoteIndex === index ? { ...quote, ...patch } : quote),
    });
  };

  const connectQuoteEvidence = () => {
    const quoteMission = missions.find((mission) => mission.id === "space-quotes");
    if (!quoteMission) return;
    if (readyQuotes.length !== 3) {
      setMessage("후보 3곳 모두 등록 가능·업종·사용권·해지 조건과 확인 자료를 살펴봐야 비교표를 완료할 수 있습니다.");
      return;
    }
    updateMissionProgress(quoteMission, {
      status: "doing",
      evidence: workspace.spaceQuotes.map((quote) => `${quote.provider}: 월환산 ${formatWon(quoteMonthlyTotal(quote))}, 확인 자료 ${quote.evidence}`).join(" / "),
      note: `계약 가능 후보 3곳 비교 완료. 최저 월환산 후보: ${recommendedQuote?.provider ?? "확인 필요"}`,
    });
    setMessage("사업장 3안 비교 결과를 미션 확인 자료에 연결했습니다. 계약 전 최종 확인 후 완료하세요.");
    setActiveView("roadmap");
    setPhase("place");
    selectMission(quoteMission);
  };

  const downloadLogo = () => {
    const name = workspace.brand.brandName || brandName || opportunity.title;
    const slogan = workspace.brand.slogan;
    const color = workspace.brand.accentColor;
    const initials = name.replaceAll(" ", "").slice(0, 2).toUpperCase();
    const symbol = logoSymbolMarkup(workspace.brand.markStyle, color, initials);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><rect width="1200" height="400" fill="white"/>${symbol}<text x="190" y="181" font-family="Arial,sans-serif" font-size="72" font-weight="700" fill="#16231d">${escapeXml(name)}</text><text x="194" y="236" font-family="Arial,sans-serif" font-size="24" fill="#627168">${escapeXml(slogan)}</text><text x="194" y="326" font-family="Arial,sans-serif" font-size="16" fill="#89958e">초기 로고 · 상표 검토 전 임시 사용</text></svg>`;
    downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${name}-스타터-로고.svg`);
    const logoMission = missions.find((mission) => mission.id === "starter-logo");
    if (logoMission) updateMissionProgress(logoMission, { status: "doing", evidence: `${name}-스타터-로고.svg · ${color} · ${workspace.brand.markStyle}` });
    setMessage("확대해도 선명한 로고 그림 파일(SVG)을 만들었습니다. 간판·포장재 대량 제작 전에는 상표와 전문 디자인 검토가 필요합니다.");
  };

  const applyTemplateLogo = async () => {
    if (!onLogoCreated) return;
    setLogoState("applying");
    setLogoMessage("");
    try {
      const name = workspace.brand.brandName || brandName || opportunity.title;
      const initials = name.replaceAll(" ", "").slice(0, 2).toUpperCase();
      const dataUrl = await imageDataUrlFromSvg(createLogoSymbolSvg(workspace.brand.markStyle, workspace.brand.accentColor, initials));
      await onLogoCreated(dataUrl);
      setLogoMessage("선택한 시안을 홈페이지 로고에 적용했습니다.");
    } catch (error) {
      setLogoMessage(error instanceof Error ? error.message : "로고를 적용하지 못했습니다.");
    } finally {
      setLogoState("idle");
    }
  };

  const generateAiLogo = async () => {
    setLogoState("generating");
    setLogoMessage("");
    try {
      const response = await fetch("/api/brand/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckType: "intro",
          businessName: workspace.brand.brandName || brandName || opportunity.title,
          slogan: workspace.brand.slogan,
          businessDescription: `${opportunity.oneLiner} 고객: ${opportunity.customer}. 방식: ${opportunity.model}.`,
          preferredColor: workspace.brand.accentColor,
          direction: logoDirection,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "인공지능 로고를 만들지 못했습니다.");
      const compressed = await compressGeneratedLogo(payload.imageDataUrl);
      setGeneratedLogo(compressed);
      setLogoMessage("새 로고 시안을 만들었습니다. 확인 후 홈페이지에 적용하세요.");
    } catch (error) {
      setLogoMessage(error instanceof Error ? error.message : "인공지능 로고를 만들지 못했습니다.");
    } finally {
      setLogoState("idle");
    }
  };

  const applyAiLogo = async () => {
    if (!generatedLogo || !onLogoCreated) return;
    setLogoState("applying");
    try {
      await onLogoCreated(generatedLogo);
      setLogoMessage("인공지능 로고를 홈페이지에 적용했습니다.");
    } catch (error) {
      setLogoMessage(error instanceof Error ? error.message : "로고를 적용하지 못했습니다.");
    } finally {
      setLogoState("idle");
    }
  };

  const downloadDeck = async () => {
    setDeckState("building");
    setMessage("");
    try {
      const response = await fetch("/api/delivery/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: workspace.brand.brandName || brandName || opportunity.title,
          slogan: workspace.brand.slogan,
          title: opportunity.title,
          oneLiner: opportunity.oneLiner,
          customer: opportunity.customer,
          model: opportunity.model,
          revenue: opportunity.revenue,
          priceWon: sellingPrice,
          risk: opportunity.risk,
          accentColor: workspace.brand.accentColor,
        }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error?.message ?? "사업소개서 파워포인트를 만들지 못했습니다.");
      }
      downloadBlob(await response.blob(), `${workspace.brand.brandName || opportunity.title}-사업소개서-초안.pptx`);
      const deckMission = missions.find((mission) => mission.id === "pitch-deck");
      if (deckMission) updateMissionProgress(deckMission, { status: "doing", evidence: `${workspace.brand.brandName || opportunity.title}-사업소개서-초안.pptx · 자동 생성본 사실검토 필요` });
      setMessage("12장 사업소개서 파워포인트 파일(PPTX)을 만들었습니다. 미확인 수치와 인터뷰 근거를 대조한 뒤 미션을 완료하세요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "사업소개서 파워포인트를 만들지 못했습니다.");
    } finally {
      setDeckState("idle");
    }
  };

  const toggleSupport = (id: SupportOptionId) => {
    const selected = workspace.selectedSupportOptions.includes(id);
    updateWorkspace({
      ...workspace,
      selectedSupportOptions: selected
        ? workspace.selectedSupportOptions.filter((option) => option !== id)
        : [...workspace.selectedSupportOptions, id],
    });
  };

  const downloadDesignBrief = async () => {
    const selected = supportOptions.filter((option) => workspace.selectedSupportOptions.includes(option.id));
    const body = [
      `# ${opportunity.title} 홈페이지 제작 요청서`,
      "",
      `- 지역: ${context.region}`,
      `- 사업유형: ${context.archetype}`,
      `- 사업장: ${context.workplaceType}`,
      `- 첫 상품 가격: ${formatWon(sellingPrice)}`,
      `- 핵심 위험: ${opportunity.risk}`,
      "",
      "## 제작 요청 범위",
      ...(selected.length ? selected.map((option) => `- ${option.title}: ${option.scope}`) : ["- 자동 제작본을 기준으로 필요한 화면과 수정 범위를 먼저 확인합니다."]),
      "",
      "## 제작 전 확인할 것",
      "- 필요한 화면과 제외 기능",
      "- 로고·사진·문구 제공 주체",
      "- 결과물과 수정 가능 횟수",
      "- 총비용, 부가세, 추가비용과 결제시점",
      "- 일정, 담당자, 중도해지·환불 조건",
      "- 원본 파일·도메인·관리 계정 소유권",
      "",
      "> 세무·법률·인허가·투자·사업 제휴 상담은 홈페이지 제작 범위에 포함되지 않습니다.",
    ].join("\n");
    try {
      await downloadBusinessDocuments({
        format: "docx",
        project: {
          title: workspace.brand.brandName || brandName || opportunity.title,
          sector: context.archetype,
          model: opportunity.model,
          customer: opportunity.customer,
          generatedAt: new Date().toISOString(),
          sample: demo,
        },
        documents: [{ id: "design-brief", title: "홈페이지 제작 요청서", type: "화면·기능·디자인 범위 확인", versionLabel: "작성본", markdown: body }],
      });
      setMessage("홈페이지 제작 요청서 워드 문서를 만들었습니다. 화면과 기능 범위를 확인한 뒤 제작 상담에 사용하세요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "홈페이지 제작 요청서를 만들지 못했습니다.");
    }
  };

  const renderMissionRow = (mission: LaunchMission) => {
    const progress = progressForMission(workspace, mission.id);
    const unlocked = dependenciesDone(mission);
    return (
      <button
        type="button"
        className={`mission-row ${selectedMission?.id === mission.id ? "active" : ""} status-${progress.status}`}
        key={mission.id}
        onClick={() => selectMission(mission)}
      >
        <span className="mission-row-check">{progress.status === "done" ? <Check /> : mission.stopGate ? <ShieldCheck /> : <span />}</span>
        <span className="mission-row-main"><small>{mission.period} · {missionRequirementLabel(mission)}</small><strong>{mission.title}</strong><em>{mission.summary}</em></span>
        <span className="mission-row-meta"><small>{mission.estimatedMinutes}분</small><b className={unlocked ? "ready" : "locked"}>{unlocked ? statusLabels[progress.status] : "먼저 해야 할 일"}</b></span>
        <ChevronRight />
      </button>
    );
  };

  const extraTools = (
    <details className="mission-extra-tools" open={activeView !== "today" ? true : undefined}>
      <summary><Wrench /> 전체 일정과 추가 도구 <ChevronRight /></summary>
      <nav className="mission-view-tabs" aria-label="실행 일정 화면">
        <button className={activeView === "today" ? "active" : ""} onClick={() => setActiveView("today")}><Target /> 한 단계씩</button>
        <button className={activeView === "roadmap" ? "active" : ""} onClick={() => setActiveView("roadmap")}><CalendarDays /> 전체 일정</button>
        <button className={activeView === "space" ? "active" : ""} onClick={() => setActiveView("space")}><Building2 /> 사업장 비교</button>
        <button className={activeView === "support" ? "active" : ""} onClick={() => setActiveView("support")}><Wrench /> 로고·홈페이지</button>
      </nav>
      <footer><button className="mission-save" onClick={() => void saveWorkspace()} disabled={saveState === "saving"}><Save /> {saveState === "saving" ? "저장 중" : saveState === "saved" ? "저장됨" : "추가 도구 입력 저장"}</button></footer>
    </details>
  );

  return (
    <section className="beginner-mission-cockpit">
      <header className="mission-cockpit-head">
        <div>
          <span className="section-label">선택 실행 도우미</span>
          <h3>{currentMission ? "지금은 한 단계만 따라 하세요" : "실행 확인을 모두 마쳤습니다"}</h3>
          <p>실행 도우미는 선택사항입니다. 하지 않아도 완성된 파일은 그대로 이용할 수 있어요.</p>
        </div>
        <div className="mission-head-progress">
          <span><strong>{progressPercent}%</strong><small>실행 확인 {doneCount}/{requiredMissions.length}</small></span>
          <i><b style={{ width: `${progressPercent}%` }} /></i>
          <button className="mission-results-shortcut" onClick={onGoToDocuments}>완성 파일 보기 <ChevronRight /></button>
        </div>
      </header>

      {activeView !== "today" && extraTools}

      {message && <div className="mission-message" role="status">{message}</div>}

      {activeView === "today" && (
        <div className="mission-guided-wrap">
          {currentMission ? (
            <GuidedMission
              mission={currentMission}
              workspace={workspace}
              dependenciesDone={dependenciesDone(currentMission)}
              saveState={saveState}
              onChange={(patch) => updateMissionProgress(currentMission, patch)}
              onFinish={() => void finishMission(currentMission)}
            />
          ) : (
            <section className="mission-all-done">
              <BadgeCheck />
              <small>실행 일정 완료</small>
              <h4>영업 전 확인을 모두 마쳤습니다</h4>
              <p>확인 자료와 수정 내용이 저장되었습니다. 최종 결과물에서 보고서와 문서를 확인할 수 있습니다.</p>
              <button onClick={onGoToDocuments}>최종 결과물 보기 <ChevronRight /></button>
            </section>
          )}
          <details className="mission-safety-details">
            <summary><ShieldCheck /> 계약·신고 전에 꼭 확인할 점 <ChevronRight /></summary>
            <p>업종·주소·거래·날짜에 따라 의무가 달라집니다. 큰 지출과 영업 전에는 계약서, 접수번호, 확인일 또는 공식 인터넷 주소를 남기고 불명확한 항목은 관할기관이나 전문가에게 확인하세요.</p>
          </details>
        </div>
      )}

      {activeView === "roadmap" && (
        <div className="mission-roadmap-layout">
          <div className="mission-phase-tabs">
            {(Object.keys(phaseMeta) as MissionPhase[]).map((phaseId) => {
              const phaseMissions = missions.filter((mission) => mission.phase === phaseId);
              const phaseDone = phaseMissions.filter((mission) => progressForMission(workspace, mission.id).status === "done").length;
              return <button key={phaseId} className={phase === phaseId ? "active" : ""} onClick={() => setPhase(phaseId)}><span>{phaseMeta[phaseId].range}</span><strong>{phaseMeta[phaseId].label}</strong><small>{phaseDone}/{phaseMissions.length}</small></button>;
            })}
          </div>
          <div className="mission-roadmap-body">
            <div className="mission-roadmap-list">
              <header><div><small>{phaseMeta[phase].range}</small><h4>{phaseMeta[phase].label} 단계</h4></div><span>{missions.filter((mission) => mission.phase === phase).length}개 확인 항목</span></header>
              {missions.filter((mission) => mission.phase === phase).map(renderMissionRow)}
            </div>
            {selectedMission && (
              <MissionDetail
                mission={selectedMission}
                workspace={workspace}
                dependenciesDone={dependenciesDone(selectedMission)}
                onChange={(patch) => updateMissionProgress(selectedMission, patch)}
                onFinish={() => void finishMission(selectedMission)}
              />
            )}
          </div>
        </div>
      )}

      {activeView === "space" && (
        <div className="space-comparison">
          <header><div><span className="section-label">실제 총비용 확인</span><h4>광고에 적힌 월 가격이 아닌 실제 부담액 비교</h4><p>부가세 미포함 월세는 10%를 더하고, 가입비는 계약기간으로 나눠 한 달 금액으로 계산합니다. 보증금은 비용과 별도로 묶이는 현금으로 표시합니다.</p></div><button onClick={connectQuoteEvidence}><FileCheck2 /> 3안 비교를 확인 자료에 연결</button></header>
          <div className="space-quote-grid">
            {workspace.spaceQuotes.map((quote, index) => {
              const ready = quoteIsContractReady(quote);
              return (
                <article className={ready ? "ready" : ""} key={quote.id}>
                  <div className="quote-title"><span>후보 {String.fromCharCode(65 + index)}</span><b>{ready ? "계약 검토 가능" : "확인 부족"}</b></div>
                  <label><span>업체·건물명</span><input value={quote.provider} placeholder="견적서와 같은 이름" onChange={(event) => updateQuote(index, { provider: event.target.value })} /></label>
                  <label><span>유형</span><select value={quote.optionType} onChange={(event) => updateQuote(index, { optionType: event.target.value as SpaceQuote["optionType"] })}>{Object.entries(workplaceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <div className="quote-money-grid">
                    <MoneyInput label="보증금" value={quote.depositWon} onChange={(value) => updateQuote(index, { depositWon: value })} />
                    <MoneyInput label="월 이용료" value={quote.monthlyRentWon} onChange={(value) => updateQuote(index, { monthlyRentWon: value })} />
                    <MoneyInput label="월 관리비" value={quote.monthlyMaintenanceWon} onChange={(value) => updateQuote(index, { monthlyMaintenanceWon: value })} />
                    <MoneyInput label="월 우편비" value={quote.monthlyMailWon} onChange={(value) => updateQuote(index, { monthlyMailWon: value })} />
                    <MoneyInput label="가입·설치비" value={quote.setupFeeWon} onChange={(value) => updateQuote(index, { setupFeeWon: value })} />
                    <label><span>계약 개월</span><input type="number" min="1" max="120" value={quote.contractMonths} onChange={(event) => updateQuote(index, { contractMonths: Math.max(1, Number(event.target.value) || 1) })} /></label>
                  </div>
                  <label className="quote-check"><input type="checkbox" checked={quote.vatIncluded} onChange={(event) => updateQuote(index, { vatIncluded: event.target.checked })} /><span>월 이용료에 부가세 포함</span></label>
                  <div className="quote-gates">
                    <label><input type="checkbox" checked={quote.registrationEligible} onChange={(event) => updateQuote(index, { registrationEligible: event.target.checked })} /><span>사업자등록 가능</span></label>
                    <label><input type="checkbox" checked={quote.industryApproved} onChange={(event) => updateQuote(index, { industryApproved: event.target.checked })} /><span>내 업종 가능</span></label>
                    <label><input type="checkbox" checked={quote.subleaseConsentVerified} onChange={(event) => updateQuote(index, { subleaseConsentVerified: event.target.checked })} /><span>사용권·전대차 확인</span></label>
                    <label><input type="checkbox" checked={quote.cancellationChecked} onChange={(event) => updateQuote(index, { cancellationChecked: event.target.checked })} /><span>해지·환불 확인</span></label>
                  </div>
                  <label><span>견적·계약 확인 자료</span><input value={quote.evidence} placeholder="예: OO견적서, 7월 14일 확인, https:// 주소" onChange={(event) => updateQuote(index, { evidence: event.target.value })} /></label>
                  <div className="quote-total"><span>월 환산 부담</span><strong>{formatWon(quoteMonthlyTotal(quote))}</strong><small>보증금 {formatWon(quote.depositWon)} 별도</small></div>
                </article>
              );
            })}
          </div>
          <div className={`quote-result ${recommendedQuote ? "ready" : ""}`}><Landmark /><div><small>가격 추천 조건</small><strong>{recommendedQuote ? `${recommendedQuote.provider} · 확인 완료 후보 중 월 환산 최저` : "등록·업종·사용권·해지 조건과 확인 자료를 모두 살펴보세요"}</strong><p>최저가여도 인허가·현장 확인·우편 수령이 안 되면 추천하지 않습니다.</p></div></div>
        </div>
      )}

      {activeView === "support" && (
        <div className="mission-support-layout">
          <section className="brand-starter-studio">
            <header><span><Palette /></span><div><small>기본 제공 이름·로고 만들기</small><h4>로고와 한 줄 소개 문구 초안</h4></div></header>
            <div className="brand-studio-body">
              <div className="brand-studio-form">
                <label><span>고객에게 보여줄 이름</span><input value={workspace.brand.brandName} onChange={(event) => updateWorkspace({ ...workspace, brand: { ...workspace.brand, brandName: event.target.value } })} placeholder="예: 이어봄" /></label>
                <label><span>한 줄 소개 문구</span><input value={workspace.brand.slogan} onChange={(event) => updateWorkspace({ ...workspace, brand: { ...workspace.brand, slogan: event.target.value } })} placeholder="예: 가족의 생활기술을 다음 세대에" /></label>
                <div className="brand-template-picker"><span>로고 시안 6개</span><div>{logoStyleOptions.map((option) => <button key={option.id} className={`logo-choice style-${option.id} ${workspace.brand.markStyle === option.id ? "active" : ""}`} onClick={() => updateWorkspace({ ...workspace, brand: { ...workspace.brand, markStyle: option.id } })}><i><b>{(workspace.brand.brandName || brandName || opportunity.title).replaceAll(" ", "").slice(0, 2).toUpperCase()}</b></i><strong>{option.label}</strong><small>{option.note}</small>{workspace.brand.markStyle === option.id && <Check />}</button>)}</div></div>
                <label className="brand-color"><span>대표색</span><input type="color" value={workspace.brand.accentColor} onChange={(event) => updateWorkspace({ ...workspace, brand: { ...workspace.brand, accentColor: event.target.value } })} /></label>
                <div className="brand-template-actions"><button className="brand-download" onClick={downloadLogo}><Download /> 원본 SVG 받기</button><button className="brand-apply" disabled={logoState !== "idle"} onClick={() => void applyTemplateLogo()}><Check /> 홈페이지에 적용</button></div>
              </div>
              <div className={`starter-logo-preview style-${workspace.brand.markStyle}`} style={{ "--brand-accent": workspace.brand.accentColor } as React.CSSProperties}>
                <span>{workspace.brand.brandName.replaceAll(" ", "").slice(0, 2).toUpperCase()}</span>
                <div><strong>{workspace.brand.brandName || "고객에게 보여줄 이름"}</strong><p>{workspace.brand.slogan || "한 줄 소개 문구"}</p></div>
                <small>상표 검토 전 임시 로고</small>
              </div>
            </div>
            <section className="ai-logo-maker"><div className="ai-logo-copy"><span><Sparkles /></span><div><small>OpenAI 연결 시 사용</small><h5>내 사업에 맞는 새 로고 만들기</h5><p>글자 없이 홈페이지에 쓰기 좋은 정사각형 심벌을 만듭니다.</p></div></div><label><span>원하는 느낌</span><input value={logoDirection} maxLength={300} onChange={(event) => setLogoDirection(event.target.value)} placeholder="예: 따뜻하지만 유아적이지 않고, 믿을 수 있는 느낌" /></label><button disabled={logoState !== "idle"} onClick={() => void generateAiLogo()}>{logoState === "generating" ? <LoaderCircle className="spin" /> : <Sparkles />} {logoState === "generating" ? "로고 만드는 중" : "AI로 새 시안 만들기"}</button>{generatedLogo && <div className="ai-logo-result"><img src={generatedLogo} alt="인공지능이 만든 로고 시안" /><div><strong>새 시안이 준비되었습니다</strong><p>홈페이지에 적용한 뒤 판매 페이지에서 다시 바꿀 수 있습니다.</p></div><button disabled={logoState !== "idle"} onClick={() => void applyAiLogo()}><Check /> 이 로고 사용</button></div>}{logoMessage && <p className="ai-logo-message" role="status">{logoMessage}</p>}</section>
          </section>

          <section className="deck-builder-row"><span><Presentation /></span><div><small>기본 제공 사업소개서</small><strong>12장 사업소개서 자동 제작</strong><p>고객 문제·해결 방식·상품·시장 근거·수익·첫 시장 진입·위험·다음 대화까지 정리합니다.</p></div><button onClick={() => void downloadDeck()} disabled={deckState === "building"}>{deckState === "building" ? "제작 중" : "파워포인트(PPTX) 만들기"} <Download /></button></section>

          <section className="support-option-section">
            <header><div><span className="section-label">선택 홈페이지 제작</span><h4>자동 제작본을 더 정교하게 맡기기</h4><p>로고, 이미지, 화면 구성과 추가 기능이 필요할 때만 제작 범위를 정해 요청합니다.</p></div><button onClick={() => void downloadDesignBrief()}><FileText /> 제작 요청서 워드</button></header>
            <div className="support-option-list">
              {supportOptions.map((option) => {
                const selected = workspace.selectedSupportOptions.includes(option.id);
                return <label className={selected ? "selected" : ""} key={option.id}><input type="checkbox" checked={selected} onChange={() => toggleSupport(option.id)} /><span><strong>{option.title}</strong><p>{option.scope}</p><small>{option.pricing}</small></span><em>{option.role}</em></label>;
              })}
            </div>
          </section>

          <section className="expert-link-section">
            <header><MapPin /><div><small>직접 확인 경로</small><h4>세무·지원사업 공식 사이트</h4><p>세무·법률·사업 연결 상담은 제공하지 않습니다. 인공지능 안내를 확인한 뒤 공식 사이트에서 대상과 날짜를 다시 확인하세요.</p></div></header>
            <div className="expert-link-grid">
              <a href="https://www.hometax.go.kr/" target="_blank" rel="noreferrer"><Landmark /><span><strong>홈택스</strong><small>사업자등록·전자신고</small></span><ExternalLink /></a>
              <a href="https://www.nts.go.kr/nts/ad/taxSchdul/selectList.do" target="_blank" rel="noreferrer"><CalendarDays /><span><strong>국세청 세무일정</strong><small>이번 달 실제 신고일 확인</small></span><ExternalLink /></a>
              <a href="https://www.k-startup.go.kr/web/main/index.do" target="_blank" rel="noreferrer"><Sparkles /><span><strong>K-Startup</strong><small>정부 창업지원 공고 사이트</small></span><ExternalLink /></a>
              <a href="https://www.bizinfo.go.kr/" target="_blank" rel="noreferrer"><Search /><span><strong>기업마당</strong><small>기업지원사업 공고</small></span><ExternalLink /></a>
            </div>
          </section>
        </div>
      )}
      {activeView === "today" && extraTools}
    </section>
  );
}

function MoneyInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label><span>{label}</span><input type="number" min="0" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} /></label>;
}

function GuidedMission({
  mission,
  workspace,
  dependenciesDone,
  saveState,
  onChange,
  onFinish,
}: {
  mission: LaunchMission;
  workspace: LaunchMissionWorkspace;
  dependenciesDone: boolean;
  saveState: "idle" | "saving" | "saved";
  onChange: (patch: Partial<{ status: LaunchMissionStatus; evidence: string; note: string }>) => void;
  onFinish: () => void;
}) {
  const progress = progressForMission(workspace, mission.id);
  const hasEvidence = Boolean(progress.evidence.trim());
  const [step, setStep] = useState(0);
  const actionCount = mission.actions.length;
  const recordStep = step === actionCount;
  const totalSteps = actionCount + 1;

  useEffect(() => setStep(0), [mission.id]);

  return (
    <div className="mission-guided-layout">
      <section className="mission-guided-card" data-mission-id={mission.id} data-guided-step={step + 1}>
        <header>
          <div>
            <span>{mission.stopGate ? <ShieldCheck /> : <Target />} 실행 항목 {Math.min(step + 1, totalSteps)}/{totalSteps}</span>
            <h4>{mission.title}</h4>
            <p>{recordStep ? "끝낸 내용을 간단히 남기면 다음 할 일로 넘어갑니다." : mission.summary}</p>
          </div>
          <em><Clock3 /> 약 {mission.estimatedMinutes}분</em>
        </header>

        <div className="mission-substep-progress" aria-label={`${totalSteps}단계 중 ${step + 1}단계`}><i><b style={{ width: `${((step + 1) / totalSteps) * 100}%` }} /></i><span>{recordStep ? "마지막 · 완료 기록" : `${step + 1}단계 · 하나씩 따라 하기`}</span></div>

        {!dependenciesDone && <div className="mission-locked"><AlertTriangle /> 먼저 해야 할 일을 완료해야 이 단계가 열립니다.</div>}

        {!recordStep ? (
          <section className="mission-single-action">
            <small>지금 할 일</small>
            <div><b>{step + 1}</b><strong>{mission.actions[step]}</strong></div>
            {mission.id === "customer-evidence" && step === 0 && (
              <div className="mission-customer-guide">
                <div className="mission-evidence-options">
                  <button type="button" className={progress.note.includes("아는 사람 1명") ? "active" : ""} onClick={() => onChange({ note: "선택한 방법: 아는 사람 1명에게 짧게 물어보기" })}><Users /><span><strong>아는 사람 1명에게 묻기</strong><small>짧게 한 번이면 충분해요</small></span></button>
                  <button type="button" className={progress.note.includes("공개 후기") ? "active" : ""} onClick={() => onChange({ note: "선택한 방법: 공개 후기에서 비슷한 사례 찾아보기" })}><Search /><span><strong>공개 후기 찾아보기</strong><small>연락할 사람이 없어도 가능해요</small></span></button>
                  <button type="button" className={progress.evidence.includes("현재 확인할 사람이 없음") ? "active" : ""} onClick={() => onChange({ evidence: "현재 확인할 사람이 없음 · 첫 문의가 생기면 보완", note: "지금은 건너뛰고 실제 문의가 생긴 뒤 해결 방법과 지출 여부를 확인하기로 함" })}><ChevronRight /><span><strong>지금은 건너뛰기</strong><small>완성 파일에는 영향이 없어요</small></span></button>
                </div>
                <details className="mission-why-more"><summary><CircleHelp /> 왜 이 확인이 필요한가요? <ChevronRight /></summary><p>예상 답변보다 고객이 실제로 사용한 방법을 보면 필요 없는 기능과 지출을 줄일 수 있습니다. 고객을 미리 알고 있어야 한다는 뜻은 아닙니다.</p></details>
              </div>
            )}
          </section>
        ) : (
          <section className="mission-evidence">
            <label htmlFor={`mission-evidence-${mission.id}`}><small>마지막 단계</small><strong>{mission.completionEvidence}</strong></label>
            <input
              id={`mission-evidence-${mission.id}`}
              value={progress.evidence}
              placeholder="문서명, 확인 날짜나 인터넷 주소를 적어주세요"
              onChange={(event) => onChange({ evidence: event.target.value })}
            />
            <textarea
              value={progress.note}
              placeholder="결정하거나 바꾼 내용이 있다면 짧게 적어주세요 (선택)"
              onChange={(event) => onChange({ note: event.target.value })}
            />
            {!hasEvidence && <p className="mission-evidence-help"><CircleHelp /> 아직 자료가 없다면 이전 단계로 돌아가거나, 나중에 다시 이어서 할 수 있어요.</p>}
          </section>
        )}

        <footer>
          {step > 0 && <button className="mission-step-back" type="button" onClick={() => setStep((current) => Math.max(0, current - 1))}>이전</button>}
          {!recordStep ? (
            <button className="mission-step-next" type="button" disabled={!dependenciesDone} onClick={() => setStep((current) => Math.min(actionCount, current + 1))}>다음 <ChevronRight /></button>
          ) : (
            <button className="mission-complete" disabled={!dependenciesDone || !hasEvidence || saveState === "saving"} onClick={onFinish}>
              {saveState === "saving" ? <>저장 중</> : <>완료하고 다음 할 일 <ChevronRight /></>}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function MissionDetail({
  mission,
  workspace,
  dependenciesDone,
  onChange,
  onFinish,
}: {
  mission: LaunchMission;
  workspace: LaunchMissionWorkspace;
  dependenciesDone: boolean;
  onChange: (patch: Partial<{ status: LaunchMissionStatus; evidence: string; note: string }>) => void;
  onFinish: () => void;
}) {
  const progress = progressForMission(workspace, mission.id);
  return (
    <aside className="mission-detail">
      <header>
        <div><span className={mission.stopGate ? "stop" : "normal"}>{mission.stopGate ? <ShieldCheck /> : <BadgeCheck />}</span><div><small>{mission.period} · 마감 {missionDueDate(workspace.startDate, mission.dueOffsetDays)}</small><h4>{mission.title}</h4></div></div>
        <em>{missionRequirementLabel(mission)}</em>
      </header>
      <div className="mission-detail-meta"><span><Clock3 /> 약 {mission.estimatedMinutes}분</span><span><CircleDollarSign /> {mission.costGuide}</span></div>
      {!dependenciesDone && <div className="mission-locked"><AlertTriangle /> 먼저 해야 할 일을 확인 자료와 함께 완료해야 합니다.</div>}
      <section><small>그대로 따라 하세요</small><ol>{mission.actions.map((action, index) => <li key={action}><b>{index + 1}</b><span>{action}</span></li>)}</ol></section>
      <section className="mission-evidence"><small>완료 확인 자료</small><strong>{mission.completionEvidence}</strong><input value={progress.evidence} placeholder="예: 접수번호 1234, 7월 14일 확인, https:// 주소" onChange={(event) => onChange({ evidence: event.target.value })} /><textarea value={progress.note} placeholder="예: 구청 담당자 확인 완료, 예상 비용 5만 원, 다음은 신청서 제출" onChange={(event) => onChange({ note: event.target.value })} /></section>
      {mission.expertRole && <section className="mission-handoff"><Users /><div><small>{mission.expertRole}에게 넘길 때</small><p>{mission.expertTrigger}</p></div></section>}
      {mission.sources.length > 0 && <section className="mission-sources"><small>공식 확인</small>{mission.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}><span><strong>{source.label}</strong><em>{source.authority}</em></span><ExternalLink /></a>)}</section>}
      <footer>
        <div className="mission-status-segment">{(["todo", "doing", "blocked"] as LaunchMissionStatus[]).map((status) => <button key={status} className={progress.status === status ? "active" : ""} onClick={() => onChange({ status })}>{statusLabels[status]}</button>)}</div>
        <button className="mission-complete" disabled={!dependenciesDone || progress.status === "done"} onClick={onFinish}>{progress.status === "done" ? <><Check /> 확인 자료 완료</> : <>확인 자료 살펴보고 완료 <ChevronRight /></>}</button>
      </footer>
    </aside>
  );
}
