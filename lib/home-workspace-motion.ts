export const WORKSPACE_DEMO_DURATION = 36_000;
export const WORKSPACE_DEMO_STEPS = ["사업 요약", "내 자료", "계획서 읽기"] as const;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const ease = (start: number, end: number, time: number) => {
  const value = clamp((time - start) / (end - start));
  return value * value * (3 - 2 * value);
};

export function workspaceDemoFrame(progress: number) {
  const normalized = clamp(Number.isFinite(progress) ? progress : 0);
  const time = normalized * WORKSPACE_DEMO_DURATION / 1000;
  const step = time < 12 ? 0 : time < 24 ? 1 : 2;
  const local = time - step * 12;
  const click = step < 2 ? ease(11, 11.3, local) * (1 - ease(11.5, 12, local)) : 0;
  return {
    progress: normalized,
    step,
    view: step === 0 ? "summary" as const : "documents" as const,
    pan: step === 0 ? ease(2, 4, local) * (1 - ease(8.5, 10, local)) : step === 1 ? ease(.8, 3, local) : 0,
    focus: step === 0 ? ease(2, 4, local) * (1 - ease(8, 10, local)) : step === 1 ? ease(4, 6, local) : 0,
    cursorMove: ease(8.5, 10.5, local),
    cursorOpacity: step < 2 ? ease(8, 8.5, local) : 0,
    click,
    entrance: ease(0, .8, local),
    reportOpen: step === 2 ? ease(0, 1.3, local) : 0,
    reportPan: step === 2 ? ease(4, 11, local) : 0,
  };
}
