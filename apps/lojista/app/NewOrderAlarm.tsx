"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = { count: number };

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

export default function NewOrderAlarm({ count }: Props) {
  const [armed, setArmed] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);

  const armAudio = useCallback(async () => {
    if (typeof window === "undefined") return;
    const AudioCtor = window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!AudioCtor) return;
    if (!audioRef.current) audioRef.current = new AudioCtor();
    if (audioRef.current.state === "suspended") await audioRef.current.resume();
    setArmed(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const armOnce = () => { void armAudio(); };
    window.addEventListener("pointerdown", armOnce, { once: true });
    window.addEventListener("keydown", armOnce, { once: true });
    return () => {
      window.removeEventListener("pointerdown", armOnce);
      window.removeEventListener("keydown", armOnce);
    };
  }, [armAudio]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (count <= 0) {
      document.title = "CLICK-FOOD • Lojista";
      return;
    }

    let highlight = true;
    document.title = `🔔 ${count} NOVO${count > 1 ? "S" : ""} PEDIDO${count > 1 ? "S" : ""}`;
    const titleTimer = window.setInterval(() => {
      highlight = !highlight;
      document.title = highlight
        ? `🔔 ${count} NOVO${count > 1 ? "S" : ""} PEDIDO${count > 1 ? "S" : ""}`
        : "CLICK-FOOD • ATENÇÃO";
    }, 900);

    const beep = () => {
      const ctx = audioRef.current;
      if (!armed || !ctx || ctx.state !== "running") return;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.24);
    };

    beep();
    const audioTimer = window.setInterval(beep, 2500);
    if ("vibrate" in navigator) navigator.vibrate([250, 120, 250]);

    return () => {
      window.clearInterval(titleTimer);
      window.clearInterval(audioTimer);
      document.title = "CLICK-FOOD • Lojista";
      if ("vibrate" in navigator) navigator.vibrate(0);
    };
  }, [count, armed]);

  if (count <= 0) return null;

  return (
    <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 9999, width: "min(720px, calc(100% - 24px))", background: "#111", color: "#fff", border: "3px solid #f4c400", borderRadius: 16, padding: "12px 16px", boxShadow: "0 14px 40px rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }} role="alert" aria-live="assertive">
      <div>
        <b style={{ color: "#f4c400", fontSize: 13 }}>🔔 NOVO PEDIDO AGUARDANDO AÇÃO</b>
        <div style={{ fontSize: 12, marginTop: 3 }}>{count} pedido{count > 1 ? "s" : ""} aguardando aceitar ou recusar.</div>
      </div>
      {!armed && <button type="button" onClick={() => void armAudio()} style={{ background: "#f4c400", color: "#111", border: 0, borderRadius: 10, padding: "10px 12px", fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" }}>ATIVAR SOM</button>}
    </div>
  );
}
