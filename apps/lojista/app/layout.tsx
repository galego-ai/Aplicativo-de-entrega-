import type { Metadata } from "next";
import "./globals.css";
import "./operational.css";
import "./management.css";
import LegalConsentGate from "./LegalConsentGate";

export const metadata: Metadata = {
  title: "CLICK-FOOD | Lojista",
  description: "Painel do lojista e PDV CLICK-FOOD"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><LegalConsentGate><><nav className="globalTools"><a href="/">Painel</a><a href="/chat">Chat</a><a href="/estoque">Estoque</a><a href="/catalogo-avancado">Catálogo avançado</a><a href="/midia">Mídia</a><a href="/repasses">Repasses</a><a href="/usuarios">Usuários</a><a href="/suporte">Suporte</a><a href="/relatorios">Relatórios</a></nav>{children}</></LegalConsentGate></body></html>;
}
