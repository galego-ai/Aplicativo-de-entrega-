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
import GlobalTools from "./GlobalTools";

export const metadata: Metadata = {
  title: "CLICK-FOOD | Lojista",
  description: "Painel do lojista e PDV CLICK-FOOD"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><LegalConsentGate><><DashboardSectionRouter/><StoreRealtimeOrderAlarm/><GlobalTools/>{children}</></LegalConsentGate></body></html>;
}
