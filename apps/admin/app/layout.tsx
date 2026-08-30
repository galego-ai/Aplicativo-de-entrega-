import type { Metadata } from "next";
import "./globals.css";
import "./management.css";

export const metadata: Metadata = {
  title: "CLICK-FOOD | Matriz",
  description: "Painel administrativo central do CLICK-FOOD"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><nav className="adminGlobalTools"><a href="/">Matriz</a><a href="/marketing">Marketing</a><a href="/repasses">Repasses</a><a href="/clientes">Clientes</a><a href="/usuarios">Usuários</a><a href="/suporte">Suporte</a></nav>{children}</body></html>;
}
