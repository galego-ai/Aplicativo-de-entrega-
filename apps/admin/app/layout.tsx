import type { Metadata } from "next";
import "./globals.css";
import "./management.css";

export const metadata: Metadata = {
  title: "CLICK-FOOD | Matriz",
  description: "Painel administrativo central do CLICK-FOOD"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
