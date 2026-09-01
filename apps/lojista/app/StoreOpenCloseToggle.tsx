"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type PauseStatus = {
  orders_paused: boolean;
  effective_open: boolean;
  status: string;
};

export default function StoreOpenCloseToggle() {
  const [storeId, setStoreId] = useState("");
  const [status, setStatus] = useState<PauseStatus | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async (knownStoreId?: string) => {
    setLoading(true);
    let currentStoreId = knownStoreId ?? storeId;

    if (!currentStoreId) {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        setLoading(false);
        return;
      }

      const { data: memberships } = await supabase
        .from("store_memberships")
        .select("store_id")
        .eq("user_id", session.user.id)
        .eq("active", true)
        .limit(1);

      currentStoreId = String(memberships?.[0]?.store_id ?? "");
      if (!currentStoreId) {
        setLoading(false);
        return;
      }
      setStoreId(currentStoreId);
    }

    const { data, error } = await supabase.functions.invoke("store-order-pause", {
      body: { storeId: currentStoreId, action: "STATUS" },
    });

    if (!error && !data?.error && data?.store) {
      setStatus(data.store as PauseStatus);
      setCanManage(Boolean(data.canManage));
    }
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    void loadStatus();
    const refresh = () => void loadStatus();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [loadStatus]);

  async function toggle() {
    if (!storeId || !status || !canManage || busy) return;

    if (!status.orders_paused && !status.effective_open) {
      window.location.assign("/configuracao");
      return;
    }

    const nextPaused = !status.orders_paused;
    const confirmMessage = nextPaused
      ? "Fechar a loja para novos pedidos? Pedidos já recebidos continuarão normalmente."
      : "Abrir a loja para novos pedidos? Os horários cadastrados continuarão valendo.";

    if (!window.confirm(confirmMessage)) return;

    setBusy(true);
    const { data, error } = await supabase.functions.invoke("store-order-pause", {
      body: { storeId, action: "SET", paused: nextPaused },
    });

    if (!error && !data?.error && data?.store) {
      setStatus(data.store as PauseStatus);
      setCanManage(Boolean(data.canManage));
    }
    setBusy(false);
  }

  if (loading && !status) {
    return <button type="button" className="storeOpenClose storeOpenCloseLoading" disabled>CONSULTANDO LOJA...</button>;
  }

  if (!status) return null;

  const manuallyClosed = status.orders_paused;
  const open = !manuallyClosed && status.effective_open;
  const outsideHours = !manuallyClosed && !status.effective_open;

  const label = busy
    ? "SALVANDO..."
    : open
      ? "🟢 LOJA ABERTA"
      : manuallyClosed
        ? "🔴 LOJA FECHADA"
        : "🟠 FECHADA PELO HORÁRIO";

  const title = !canManage
    ? "Seu perfil pode consultar o estado da loja, mas não alterá-lo."
    : outsideHours
      ? "Clique para revisar os horários da loja."
      : open
        ? "Clique para fechar a loja para novos pedidos."
        : "Clique para abrir a loja para novos pedidos.";

  return (
    <button
      type="button"
      className={`storeOpenClose ${open ? "isOpen" : manuallyClosed ? "isClosed" : "isScheduleClosed"}`}
      onClick={toggle}
      disabled={busy || !canManage}
      title={title}
      aria-label={title}
    >
      {label}
    </button>
  );
}
