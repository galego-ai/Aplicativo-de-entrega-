import type { Metadata } from "next";
import "./globals.css";
import "./management.css";
import "./premium.css";
import "./matrix-nav.css";
import AdminDriverRealtimeRefresh from "./AdminDriverRealtimeRefresh";
import AdminNavigationTools from "./AdminNavigationTools";

const RECOVERY_URL = "https://rmlbmacoqnynqdqmxecz.supabase.co/functions/v1/password-recovery";

export const metadata: Metadata = {
  title: "CLICK-FOOD | Matriz",
  description: "Painel administrativo central do CLICK-FOOD"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body data-recovery-portal={RECOVERY_URL}><AdminDriverRealtimeRefresh/><AdminNavigationTools/>{children}</body></html>;
}
