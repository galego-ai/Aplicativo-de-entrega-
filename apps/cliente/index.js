import React from "react";
import { registerRootComponent } from "expo";
import App from "./App";
import CustomerProfessionalShell from "./CustomerProfessionalShell";
import AccountLifecycleHost from "./AccountLifecycle";
import LegalConsentGate from "./LegalConsentGate";

function Root(){
  return <AccountLifecycleHost scheme="clickfood-cliente"><CustomerProfessionalShell><App/></CustomerProfessionalShell><LegalConsentGate/></AccountLifecycleHost>;
}

registerRootComponent(Root);
