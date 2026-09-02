"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_ORDER_SOUND,
  ORDER_AUDIO_ENABLED_KEY,
  ORDER_AUDIO_ENABLE_EVENT,
  ORDER_SOUND_EVENT,
  ORDER_SOUND_PREVIEW_EVENT,
  ORDER_SOUND_STORAGE_KEY,
  ORDER_SOUNDS,
  resolveOrderSound,
} from "./orderSounds";

export default function OrderSoundSelector() {
  const [selectedId, setSelectedId] = useState(DEFAULT_ORDER_SOUND.id);
  const [previewing, setPreviewing] = useState(false);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSelectedId(resolveOrderSound(localStorage.getItem(ORDER_SOUND_STORAGE_KEY)).id);
    return () => {
      previewRef.current?.pause();
      previewRef.current = null;
    };
  }, []);

  function broadcastPreview(active: boolean) {
    window.dispatchEvent(new CustomEvent(ORDER_SOUND_PREVIEW_EVENT, { detail: { active } }));
  }

  function stopPreview() {
    const audio = previewRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      previewRef.current = null;
    }
    setPreviewing(false);
    if (typeof window !== "undefined") broadcastPreview(false);
  }

  function choose(nextId: string) {
    stopPreview();
    const sound = resolveOrderSound(nextId);
    setSelectedId(sound.id);
    localStorage.setItem(ORDER_SOUND_STORAGE_KEY, sound.id);
    window.dispatchEvent(new CustomEvent(ORDER_SOUND_EVENT, { detail: { id: sound.id } }));
  }

  async function preview() {
    if (previewing) {
      stopPreview();
      return;
    }

    stopPreview();
    const sound = resolveOrderSound(selectedId);
    const audio = new Audio(sound.src);
    audio.preload = "auto";
    audio.volume = 1;
    previewRef.current = audio;
    setPreviewing(true);
    broadcastPreview(true);
    localStorage.setItem(ORDER_AUDIO_ENABLED_KEY, "enabled");
    window.dispatchEvent(new Event(ORDER_AUDIO_ENABLE_EVENT));
    audio.onended = () => stopPreview();
    audio.onerror = () => stopPreview();

    try {
      await audio.play();
    } catch {
      stopPreview();
    }
  }

  return (
    <section
      aria-label="Escolha do toque de novo pedido"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 10002,
        width: "min(440px,calc(100vw - 32px))",
        background: "#fff",
        color: "#161616",
        border: "2px solid #f4c400",
        borderRadius: 16,
        padding: 14,
        boxShadow: "0 16px 44px rgba(0,0,0,.22)",
      }}
    >
      <div style={{ display: "grid", gap: 3, marginBottom: 10 }}>
        <b style={{ fontSize: 12, letterSpacing: .4 }}>🔔 TOQUE DE NOVO PEDIDO</b>
        <span style={{ fontSize: 11, color: "#626262" }}>
          Escolha aqui no painel. O alerta repete até o pedido ser aceito ou recusado.
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
        <select
          aria-label="Som de novo pedido"
          value={selectedId}
          onChange={(event) => choose(event.target.value)}
          style={{ minWidth: 0, width: "100%", border: "1px solid #cfd2d6", borderRadius: 10, padding: "10px 11px", background: "#fff", fontWeight: 800, color: "#222" }}
        >
          {ORDER_SOUNDS.map((sound) => <option key={sound.id} value={sound.id}>{sound.label}</option>)}
        </select>
        <button
          type="button"
          onClick={() => void preview()}
          style={{ border: 0, borderRadius: 10, padding: "10px 13px", background: previewing ? "#222" : "#f4c400", color: previewing ? "#fff" : "#111", fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          {previewing ? "■ Parar" : "▶ Ouvir"}
        </button>
      </div>
      <small style={{ display: "block", marginTop: 8, color: "#777", fontSize: 10 }}>
        A escolha fica salva neste computador/tablet. Cada terminal pode usar um toque diferente.
      </small>
    </section>
  );
}
