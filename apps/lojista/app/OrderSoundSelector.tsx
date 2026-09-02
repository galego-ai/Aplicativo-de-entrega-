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
  const [open, setOpen] = useState(false);
  const [savedId, setSavedId] = useState(DEFAULT_ORDER_SOUND.id);
  const [draftId, setDraftId] = useState(DEFAULT_ORDER_SOUND.id);
  const [previewing, setPreviewing] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = resolveOrderSound(localStorage.getItem(ORDER_SOUND_STORAGE_KEY)).id;
    setSavedId(current);
    setDraftId(current);
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

  function close() {
    stopPreview();
    setDraftId(savedId);
    setSavedNotice(false);
    setOpen(false);
  }

  function save() {
    stopPreview();
    const sound = resolveOrderSound(draftId);
    localStorage.setItem(ORDER_SOUND_STORAGE_KEY, sound.id);
    localStorage.setItem(ORDER_AUDIO_ENABLED_KEY, "enabled");
    setSavedId(sound.id);
    setDraftId(sound.id);
    setSavedNotice(true);
    window.dispatchEvent(new CustomEvent(ORDER_SOUND_EVENT, { detail: { id: sound.id } }));
    // O clique em Salvar também libera o áudio do navegador para os próximos pedidos.
    window.dispatchEvent(new Event(ORDER_AUDIO_ENABLE_EVENT));
  }

  async function preview() {
    if (previewing) {
      stopPreview();
      return;
    }

    stopPreview();
    const sound = resolveOrderSound(draftId);
    const audio = new Audio(sound.src);
    audio.preload = "auto";
    audio.volume = 1;
    previewRef.current = audio;
    setPreviewing(true);
    setSavedNotice(false);
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

  return <>
    <button
      type="button"
      onClick={() => { setDraftId(savedId); setSavedNotice(false); setOpen(true); }}
      aria-haspopup="dialog"
      aria-expanded={open}
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        zIndex: 10000,
        border: "1px solid #d7b500",
        borderRadius: 999,
        padding: "10px 14px",
        background: "#f4c400",
        color: "#111",
        fontWeight: 950,
        fontSize: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,.16)",
        cursor: "pointer",
      }}
    >🔔 Som do pedido</button>

    {open && <div
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10020,
        display: "grid",
        placeItems: "center",
        padding: 18,
        background: "rgba(10,12,16,.48)",
        backdropFilter: "blur(3px)",
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-sound-title"
        style={{
          width: "min(460px,100%)",
          background: "#fff",
          color: "#161616",
          border: "1px solid #e1e3e6",
          borderRadius: 18,
          padding: 18,
          boxShadow: "0 24px 70px rgba(0,0,0,.30)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
          <div>
            <b id="order-sound-title" style={{ display: "block", fontSize: 15 }}>🔔 Som de novo pedido</b>
            <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "#686d75", lineHeight: 1.4 }}>
              Escolha o toque que ficará repetindo enquanto houver pedido aguardando aceite ou recusa.
            </span>
          </div>
          <button type="button" aria-label="Fechar" onClick={close} style={{ border: 0, background: "#f0f1f3", borderRadius: 9, width: 34, height: 34, cursor: "pointer", fontWeight: 900 }}>✕</button>
        </div>

        <label style={{ display: "grid", gap: 7, marginTop: 16, fontSize: 11, fontWeight: 900 }}>
          TOQUE
          <select
            aria-label="Som de novo pedido"
            value={draftId}
            onChange={(event) => { stopPreview(); setSavedNotice(false); setDraftId(event.target.value); }}
            style={{ width: "100%", border: "1px solid #cfd2d6", borderRadius: 11, padding: "11px 12px", background: "#fff", fontWeight: 800, color: "#222" }}
          >
            {ORDER_SOUNDS.map((sound) => <option key={sound.id} value={sound.id}>{sound.label}</option>)}
          </select>
        </label>

        {savedNotice && <div role="status" style={{ marginTop: 10, borderRadius: 10, padding: "9px 11px", background: "#e8f7ed", color: "#22633a", fontSize: 11, fontWeight: 850 }}>✓ Toque salvo neste computador/tablet.</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 15 }}>
          <button type="button" onClick={() => void preview()} style={{ border: "1px solid #d8dbe0", borderRadius: 10, padding: "11px 10px", background: previewing ? "#222" : "#fff", color: previewing ? "#fff" : "#222", fontWeight: 900, cursor: "pointer" }}>{previewing ? "■ Parar" : "▶ Ouvir"}</button>
          <button type="button" onClick={save} style={{ border: 0, borderRadius: 10, padding: "11px 10px", background: "#f4c400", color: "#111", fontWeight: 950, cursor: "pointer" }}>Salvar</button>
          <button type="button" onClick={close} style={{ border: "1px solid #d8dbe0", borderRadius: 10, padding: "11px 10px", background: "#f4f5f6", color: "#333", fontWeight: 900, cursor: "pointer" }}>Fechar</button>
        </div>

        <small style={{ display: "block", marginTop: 10, color: "#777", fontSize: 10, lineHeight: 1.4 }}>
          A preferência é individual por terminal. Assim caixa e cozinha podem usar toques diferentes.
        </small>
      </section>
    </div>}
  </>;
}
