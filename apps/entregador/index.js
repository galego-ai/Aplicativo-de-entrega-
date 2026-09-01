import "./BackgroundLocation";
import React from "react";
import { registerRootComponent } from "expo";
import App from "./App";
import DriverProfessionalShell from "./DriverProfessionalShell";
import DriverDocumentsHost from "./DriverDocumentsHost";
import AccountLifecycleHost from "./AccountLifecycle";
import LegalConsentGate from "./LegalConsentGate";

function Root(){
  return <AccountLifecycleHost scheme="clickfood-entregador"><DriverDocumentsHost><DriverProfessionalShell><App/></DriverProfessionalShell></DriverDocumentsHost><LegalConsentGate/></AccountLifecycleHost>;
}

registerRootComponent(Root);