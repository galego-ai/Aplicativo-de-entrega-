"use client";

import { usePathname } from "next/navigation";
import StoreOpenCloseToggle from "./StoreOpenCloseToggle";

const RECOVERY_URL = "https://rmlbmacoqnynqdqmxecz.supabase.co/functions/v1/password-recovery";

const links = [
  ["Painel", "/"],
  ["Cozinha", "/cozinha"],
  ["PDV", "/pdv"],
  ["Produtos", "/produtos"],
  ["Categorias", "/categorias"],
  ["Promoções", "/promocoes"],
  ["Estoque", "/estoque"],
  ["Catálogo avançado", "/catalogo-avancado"],
  ["Mapa", "/mapa"],
  ["Configuração", "/configuracao"],
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

  // A Cozinha/KDS precisa de toda a área útil para os pedidos.
  // Nessa rota a navegação inferior seria duplicada, pois já existe o botão Painel no cabeçalho.
  if (pathname.startsWith("/cozinha")) return null;

  return (
    <nav className="globalTools" aria-label="Atalhos do Painel Lojista">
      <StoreOpenCloseToggle />
      {links.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
      <a href={RECOVERY_URL}>Recuperar acesso</a>
    </nav>
  );
}
