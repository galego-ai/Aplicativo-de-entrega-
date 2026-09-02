"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";
import OrderSoundSelector from "./OrderSoundSelector";
import {
  DEFAULT_ORDER_SOUND,
  ORDER_AUDIO_ENABLED_KEY,
  ORDER_AUDIO_ENABLE_EVENT,
  ORDER_SOUND_EVENT,
  ORDER_SOUND_PREVIEW_EVENT,
  ORDER_SOUND_STORAGE_KEY,
  resolveOrderSound,
} from "./orderSounds";

type PendingOrder = { id: string; order_number: number; created_at: string };
type SoundChangeDetail = { id?: string };
type SoundPreviewDetail = { active?: boolean };

export default function StoreRealtimeOrderAlarm() {
  const pathname = usePathname();
  const onOrdersPage = pathname.startsWith("/cozinha");
  const [storeId, setStoreId] = useState("");
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [selectedSoundId, setSelectedSoundId] = useState(DEFAULT_ORDER_SOUND.id);
  const [previewing, setPreviewing] = useState(false);
  const alarmRef = useRef<HTMLAudioElement | null>(null);
  const alarmTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopAlarm() {
    if (alarmTimerRef.current) {
      clearInterval(alarmTimerRef.current);
      alarmTimerRef.current = null;
    }
    const audio = alarmRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  async function enableAudio() {
    if (typeof window === "undefined") return;
    try {
      const sound = resolveOrderSound(selectedSoundId);
      const audio = alarmRef.current ?? new Audio(sound.src);
      alarmRef.current = audio;
      audio.src = sound.src;
      audio.volume = 0.01;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1;
      localStorage.setItem(ORDER_AUDIO_ENABLED_KEY, "enabled");
      setAudioEnabled(true);
    } catch {
      setAudioEnabled(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSelectedSoundId(resolveOrderSound(localStorage.getItem(ORDER_SOUND_STORAGE_KEY)).id);

    const onSound = (event: Event) => {
      const id = (event as CustomEvent<SoundChangeDetail>).detail?.id;
      setSelectedSoundId(resolveOrderSound(id).id);
    };
    const onEnable = () => setAudioEnabled(true);
    const onPreview = (event: Event) => setPreviewing(Boolean((event as CustomEvent<SoundPreviewDetail>).detail?.active));

    window.addEventListener(ORDER_SOUND_EVENT, onSound as EventListener);
    window.addEventListener(ORDER_AUDIO_ENABLE_EVENT, onEnable);
    window.addEventListener(ORDER_SOUND_PREVIEW_EVENT, onPreview as EventListener);

    if (localStorage.getItem(ORDER_AUDIO_ENABLED_KEY) === "enabled") {
      const unlock = () => {
        void enableAudio();
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
      };
      window.addEventListener("pointerdown", unlock, { once: true });
      window.addEventListener("keydown", unlock, { once: true });
      return () => {
        window.removeEventListener(ORDER_SOUND_EVENT, onSound as EventListener);
        window.removeEventListener(ORDER_AUDIO_ENABLE_EVENT, onEnable);
        window.removeEventListener(ORDER_SOUND_PREVIEW_EVENT, onPreview as EventListener);
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
      };
    }

    return () => {
      window.removeEventListener(ORDER_SOUND_EVENT, onSound as EventListener);
      window.removeEventListener(ORDER_AUDIO_ENABLE_EVENT, onEnable);
      window.removeEventListener(ORDER_SOUND_PREVIEW_EVENT, onPreview as EventListener);
    };
  }, [selectedSoundId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return;
      const { data: membership } = await supabase
        .from("store_memberships")
        .select("store_id")
        .eq("user_id", userId)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if (active && membership?.store_id) setStoreId(String(membership.store_id));
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!storeId) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,order_number,created_at")
        .eq("store_id", storeId)
        .eq("status", "WAITING_STORE")
        .order("created_at", { ascending: true })
        .limit(20);
      setPending((data ?? []) as PendingOrder[]);
    };
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void load(), 120);
    };
    void load();
    const channel = supabase
      .channel(`store-order-alarm-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` }, refresh)
      .subscribe();
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [storeId]);

  useEffect(() => {
    stopAlarm();
    if (!pending.length || !audioEnabled || previewing) return;

    const sound = resolveOrderSound(selectedSoundId);
    const playOnce = () => {
      const audio = alarmRef.current ?? new Audio(sound.src);
      alarmRef.current = audio;
      if (audio.src !== sound.src) audio.src = sound.src;
      audio.loop = false;
      audio.volume = 1;
      audio.currentTime = 0;
      void audio.play().catch(() => setAudioEnabled(false));
    };

    playOnce();
    alarmTimerRef.current = setInterval(playOnce, 2600);
    if ("vibrate" in navigator) navigator.vibrate([250, 120, 250]);

    return () => {
      stopAlarm();
      if ("vibrate" in navigator) navigator.vibrate(0);
    };
  }, [pending.length, audioEnabled, previewing, selectedSoundId]);

  useEffect(() => () => stopAlarm(), []);

  if (!storeId) return null;
  const first = pending[0];

  return <>
    {onOrdersPage && <OrderSoundSelector />}
    {!audioEnabled && <button
      type="button"
      onClick={() => void enableAudio()}
      style={{ position: "fixed", right: 16, bottom: onOrdersPage ? 170 : 88, zIndex: 10003, border: "1px solid #d7b500", background: "#fff8cf", color: "#332b00", borderRadius: 999, padding: "10px 14px", fontWeight: 900, fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,.14)", cursor: "pointer" }}
    >🔔 Ativar som dos pedidos</button>}
    {first && <aside role="alert" aria-live="assertive" style={{ position: "fixed", right: 16, top: 16, zIndex: 10001, width: "min(390px,calc(100vw - 32px))", background: "#111", color: "#fff", border: "3px solid #f4c400", borderRadius: 18, padding: 16, boxShadow: "0 18px 50px rgba(0,0,0,.35)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ color: "#f4c400", fontSize: 10, fontWeight: 900, letterSpacing: 1.2 }}>NOVO PEDIDO</div>
          <div style={{ fontSize: 24, fontWeight: 950, marginTop: 3 }}>Pedido #{first.order_number}</div>
          <div style={{ color: "#cfcfcf", fontSize: 12, marginTop: 5 }}>{pending.length === 1 ? "1 pedido aguardando decisão" : `${pending.length} pedidos aguardando decisão`}</div>
        </div>
        <span style={{ fontSize: 30 }}>🍽️</span>
      </div>
      <p style={{ fontSize: 12, lineHeight: 1.45, color: "#ddd", margin: "12px 0" }}>
        O alerta e o toque escolhido permanecem enquanto houver pedido em <b>Aguardando a loja</b>. Aceite ou recuse pela Cozinha/Pedidos.
      </p>
      <a href="/cozinha" style={{ display: "block", textAlign: "center", background: "#f4c400", color: "#111", borderRadius: 11, padding: "11px 14px", fontWeight: 950, textDecoration: "none" }}>ABRIR PEDIDOS E RESPONDER</a>
    </aside>}
  </>;
}
