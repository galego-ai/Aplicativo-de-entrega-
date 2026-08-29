import type { Metadata } from "next";
import "./globals.css";
import "./shortcut.css";
import "./operational.css";

export const metadata: Metadata = {
  title: "CLICK-FOOD | Lojista",
  description: "Painel do lojista e PDV CLICK-FOOD"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><a className="configShortcut" href="/configuracao">⚙ Configurar loja</a>{children}</body></html>;
}
