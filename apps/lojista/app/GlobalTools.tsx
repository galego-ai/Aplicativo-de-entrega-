"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import StoreOpenCloseToggle from "./StoreOpenCloseToggle";

const RECOVERY_URL = "https://rmlbmacoqnynqdqmxecz.supabase.co/functions/v1/password-recovery";

const moreLinks = [
  ["Categorias", "/categorias"],
  ["Promoções", "/promocoes"],
  ["Catálogo avançado", "/catalogo-avancado"],
  ["Mapa", "/mapa"],
  ["Chat", "/chat"],
  ["Entregadores", "/entregadores"],
  ["Mídia", "/midia"],
  ["Recibos", "/recibos"],
  ["Repasses", "/repasses"],
  ["Usuários", "/usuarios"],
  ["Suporte", "/suporte"],
  ["Relatórios", "/relatorios"],
] as const;

export default function GlobalTools() {
  const pathname = usePathname();
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let observer: MutationObserver | null = null;

    const attachToSidebar = () => {
      const nav = document.querySelector<HTMLElement>(".side nav");
      if (!nav) return false;

      let mount = nav.querySelector<HTMLElement>("[data-clickfood-side-tools]");
      if (!mount) {
        mount = document.createElement("div");
        mount.dataset.clickfoodSideTools = "true";
        mount.className = "sidePortalMount";

        const firstItem = nav.firstElementChild;
        if (firstItem?.nextSibling) nav.insertBefore(mount, firstItem.nextSibling);
        else nav.appendChild(mount);
      }

      setMountNode(mount);
      return true;
    };

    if (!attachToSidebar()) {
      observer = new MutationObserver(() => {
        if (attachToSidebar()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      document.querySelector<HTMLElement>("[data-clickfood-side-tools]")?.remove();
      setMountNode(null);
    };
  }, [pathname]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen || !mountNode) return;

    const closeOutside = (event: PointerEvent) => {
      if (!mountNode.contains(event.target as Node)) setMoreOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen, mountNode]);

  if (!mountNode) return null;

  return createPortal(
    <>
      <a className={`sideMenuEntry sideKitchenLink${pathname.startsWith("/cozinha") ? " active" : ""}`} href="/cozinha">
        <span aria-hidden="true">🍳</span> Cozinha
      </a>

      <button
        type="button"
        className={`sideMoreButton${moreOpen ? " active" : ""}`}
        onClick={() => setMoreOpen((current) => !current)}
        aria-expanded={moreOpen}
        aria-controls="clickfood-more-menu"
      >
        <span><b aria-hidden="true">＋</b> Mais</span>
        <span aria-hidden="true">{moreOpen ? "▴" : "▾"}</span>
      </button>

      {moreOpen && (
        <div id="clickfood-more-menu" className="sideMorePanel" role="menu" aria-label="Mais opções do Painel Lojista">
          <div className="sideMoreHeader">
            <div>
              <small>ATALHOS</small>
              <strong>Mais opções</strong>
            </div>
            <button type="button" className="sideMoreClose" onClick={() => setMoreOpen(false)} aria-label="Fechar mais opções">×</button>
          </div>

          <StoreOpenCloseToggle />

          <div className="sideMoreLinks">
            {moreLinks.map(([label, href]) => (
              <a key={href} href={href} role="menuitem" className={pathname.startsWith(href) ? "active" : ""}>{label}</a>
            ))}
            <a href={RECOVERY_URL} role="menuitem">Recuperar acesso</a>
          </div>
        </div>
      )}
    </>,
    mountNode,
  );
}
