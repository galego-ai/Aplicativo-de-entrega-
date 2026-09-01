"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function AdminDriverRealtimeRefresh() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => window.location.reload(), 350);
    };

    const channel = supabase
      .channel("admin-driver-realtime-refresh")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, refresh)
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [pathname]);

  return null;
}
