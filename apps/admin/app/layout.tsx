import type { Metadata } from "next";
import "./globals.css";
import "./management.css";
import "./premium.css";
import AdminDriverRealtimeRefresh from "./AdminDriverRealtimeRefresh";

const RECOVERY_URL = "https://rmlbmacoqnynqdqmxecz.supabase.co/functions/v1/password-recovery";
const RECOVERY_LABEL = "Recuperar acesso";

export const metadata: Metadata = {
  title: "CLICK-FOOD | Matriz",
  description: "Painel administrativo central do CLICK-FOOD"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><AdminDriverRealtimeRefresh/><nav className="adminGlobalTools"><a href="/">Matriz</a><a href="/saude-operacional">Saúde operacional</a><a href="/cidades">Cidades</a><a href="/catalogos">Catálogos</a><a href="/mapa">Mapa</a><a href="/documentos-entregadores">Documentos</a><a href="/marketing">Marketing</a><a href="/notificacoes">Notificações</a><a href="/cobranca">Cobrança</a><a href="/pagamentos">Pagamentos</a><a href="/repasses">Repasses</a><a href="/clientes">Clientes</a><a href="/usuarios">Usuários</a><a href="/suporte">Suporte</a><a href="/legal">Termos & Privacidade</a><a href={RECOVERY_URL}>{RECOVERY_LABEL}</a></nav>{children}</body></html>;
}
