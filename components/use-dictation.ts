"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * 말로 적기(마이크) — 브라우저의 음성 인식(Web Speech API)으로 들은 말을 글로 넘긴다. 서버·AI 를 부르지 않는다.
 * 브라우저가 지원하지 않으면(파이어폭스 등) supported 가 false — 마이크 단추를 그리지 않는다.
 * 한 번 누르면 듣기 시작, 다시 누르거나 말이 끝나면 멈춘다. 들은 글은 onText 로 한 번에 넘긴다(입력칸에 이어 붙이는 일은 부른 쪽이).
 */
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function useDictation(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const handler = useRef(onText);
  useEffect(() => { handler.current = onText; });
  useEffect(() => { setSupported(!!recognitionCtor()); return () => recognition.current?.abort(); }, []);
  const stop = useCallback(() => { recognition.current?.stop(); }, []);
  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recognition.current) return;
    const next = new Ctor();
    next.lang = "ko-KR"; next.interimResults = false; next.continuous = false;
    next.onresult = event => {
      const text = Array.from(event.results).map(result => result[0]?.transcript ?? "").join(" ").trim();
      if (text) handler.current(text);
    };
    const end = () => { recognition.current = null; setListening(false); };
    next.onend = end; next.onerror = end;
    recognition.current = next;
    try { next.start(); setListening(true); } catch { end(); }
  }, []);
  const toggle = useCallback(() => { if (recognition.current) stop(); else start(); }, [start, stop]);
  return { supported, listening, start, stop, toggle };
}
