import type { Metadata } from "next";
import "./globals.css";
import "./operational.css";
import "./management.css";
import "./map.css";
import "./premium.css";
import "./pdv.css";
import "./store-settings.css";
import "./kds.css";
import "./categories.css";
import "./promotions.css";
import LegalConsentGate from "./LegalConsentGate";
import DashboardSectionRouter from "./DashboardSectionRouter";
import StoreRealtimeOrderAlarm from "./StoreRealtimeOrderAlarm";
import StoreOpenCloseToggle from "./StoreOpenCloseToggle";

const RECOVERY_URL = "https://rmlbmacoqnynqdqmxecz.supabase.co/functions/v1/password-recovery";

export const metadata: Metadata = {
  title: "CLICK-FOOD | Lojista",
  description: "Painel do lojista e PDV CLICK-FOOD"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><LegalConsentGate><><DashboardSectionRouter/><StoreRealtimeOrderAlarm/><nav className="globalTools"><StoreOpenCloseToggle/><a href="/">Painel</a><a href="/cozinha">Cozinha</a><a href="/pdv">PDV</a><a href="/produtos">Produtos</a><a href="/categorias">Categorias</a><a href="/promocoes">Promoções</a><a href="/estoque">Estoque</a><a href="/catalogo-avancado">Catálogo avançado</a><a href="/mapa">Mapa</a><a href="/configuracao">Configuração</a><a href="/chat">Chat</a><a href="/entregadores">Entregadores</a><a href="/midia">Mídia</a><a href="/recibos">Recibos</a><a href="/repasses">Repasses</a><a href="/usuarios">Usuários</a><a href="/suporte">Suporte</a><a href="/relatorios">Relatórios</a><a href={RECOVERY_URL}>Recuperar acesso</a></nav>{children}</></LegalConsentGate></body></html>;
}
