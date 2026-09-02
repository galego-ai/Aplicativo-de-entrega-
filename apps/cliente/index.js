import React from "react";
import { registerRootComponent } from "expo";
import App from "./App";
import CustomerProfessionalShell from "./CustomerProfessionalShell";
import AccountLifecycleHost from "./AccountLifecycle";
import LegalConsentGate from "./LegalConsentGate";
import SavedCardsHost from "./SavedCardsHost";

function Root(){
  return <AccountLifecycleHost scheme="clickfood-cliente"><SavedCardsHost><CustomerProfessionalShell><App/></CustomerProfessionalShell></SavedCardsHost><LegalConsentGate/></AccountLifecycleHost>;
}

registerRootComponent(Root);
