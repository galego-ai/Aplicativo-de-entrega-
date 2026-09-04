"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

const secondaryTabs = ["Cidades", "Planos", "Bônus", "Auditoria"] as const;

const operationLinks = [
  ["Saúde operacional", "/saude-operacional"],
  ["Mapa", "/mapa"],
  ["Clientes", "/clientes"],
  ["Avaliações", "/avaliacoes"],
  ["Catálogos", "/catalogos"],
  ["Documentos dos entregadores", "/documentos-entregadores"],
] as const;

const financeLinks = [
  ["Cobrança", "/cobranca"],
  ["Pagamentos", "/pagamentos"],
  ["Repasses", "/repasses"],
] as const;

const communicationLinks = [
  ["Marketing", "/marketing"],
  ["Notificações", "/notificacoes"],
  ["Suporte", "/suporte"],
] as const;

const adminLinks = [
  ["Usuários", "/usuarios"],
  ["Termos & Privacidade", "/legal"],
] as const;

const RECOVERY_URL = "https://rmlbmacoqnynqdqmxecz.supabase.co/functions/v1/password-recovery";

function samePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNavigationTools() {
  const pathname = usePathname();
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [secondaryActive, setSecondaryActive] = useState(false);

  useEffect(() => {
    let treeObserver: MutationObserver | null = null;
    let navObserver: MutationObserver | null = null;
    let nav: HTMLElement | null = null;

    const syncSecondaryState = () => {
      if (!nav) return;
      const active = Array.from(nav.querySelectorAll<HTMLButtonElement>("button.matrixSecondaryTab"))
        .some((button) => button.classList.contains("active"));
      setSecondaryActive(active);
    };

    const attach = () => {
      nav = document.querySelector<HTMLElement>(".sidebar nav");
      if (!nav) return false;

      const buttons = Array.from(nav.querySelectorAll<HTMLButtonElement>(":scope > button"));
      for (const button of buttons) {
        if (secondaryTabs.includes(button.textContent?.trim() as (typeof secondaryTabs)[number])) {
          button.classList.add("matrixSecondaryTab");
        }
      }

      let mount = nav.querySelector<HTMLElement>("[data-clickfood-matrix-tools]");
      if (!mount) {
        mount = document.createElement("div");
        mount.dataset.clickfoodMatrixTools = "true";
        mount.className = "matrixPortalMount";
        nav.appendChild(mount);
      }
      setMountNode(mount);
      syncSecondaryState();

      navObserver = new MutationObserver(syncSecondaryState);
      navObserver.observe(nav, { attributes: true, subtree: true, attributeFilter: ["class"] });
      return true;
    };

    if (!attach()) {
      treeObserver = new MutationObserver(() => {
        if (attach()) treeObserver?.disconnect();
      });
      treeObserver.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      treeObserver?.disconnect();
      navObserver?.disconnect();
      document.querySelectorAll<HTMLButtonElement>(".sidebar nav > button.matrixSecondaryTab")
        .forEach((button) => button.classList.remove("matrixSecondaryTab"));
      document.querySelector<HTMLElement>("[data-clickfood-matrix-tools]")?.remove();
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

  function openInternalTab(label: (typeof secondaryTabs)[number]) {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar nav > button"))
      .find((item) => item.textContent?.trim() === label);
    button?.click();
    setSecondaryActive(true);
    setMoreOpen(false);
  }

  if (!mountNode) return null;

  const linkGroup = (title: string, links: readonly (readonly [string, string])[]) => (
    <section className="matrixMoreGroup" key={title}>
      <small>{title}</small>
      <div className="matrixMoreLinks">
        {links.map(([label, href]) => (
          <a key={href} href={href} className={samePath(pathname, href) ? "active" : ""}>{label}</a>
        ))}
      </div>
    </section>
  );

  return createPortal(
    <div className="matrixMoreRoot">
      <button
        type="button"
        className={`matrixMoreButton${moreOpen || secondaryActive ? " active" : ""}`}
        onClick={() => setMoreOpen((current) => !current)}
        aria-expanded={moreOpen}
        aria-controls="clickfood-matrix-more"
      >
        <span><b aria-hidden="true">＋</b> Mais</span>
        <span aria-hidden="true">{moreOpen ? "▴" : "▾"}</span>
      </button>

      {moreOpen && (
        <div id="clickfood-matrix-more" className="matrixMorePanel" role="menu" aria-label="Mais opções da Matriz CLICK-FOOD">
          <div className="matrixMoreHeader">
            <div>
              <small>MATRIZ CLICK-FOOD</small>
              <strong>Mais opções</strong>
            </div>
            <button type="button" className="matrixMoreClose" onClick={() => setMoreOpen(false)} aria-label="Fechar mais opções">×</button>
          </div>

          <section className="matrixMoreGroup">
            <small>GESTÃO</small>
            <div className="matrixMoreLinks">
              {secondaryTabs.map((label) => (
                <button key={label} type="button" onClick={() => openInternalTab(label)}>{label}</button>
              ))}
            </div>
          </section>

          {linkGroup("OPERAÇÃO", operationLinks)}
          {linkGroup("FINANCEIRO", financeLinks)}
          {linkGroup("COMUNICAÇÃO", communicationLinks)}
          {linkGroup("ADMINISTRAÇÃO", adminLinks)}

          <section className="matrixMoreGroup matrixAccessGroup">
            <small>ACESSO</small>
            <div className="matrixMoreLinks">
              <a href={RECOVERY_URL}>Recuperar acesso</a>
            </div>
          </section>
        </div>
      )}
    </div>,
    mountNode,
  );
}
