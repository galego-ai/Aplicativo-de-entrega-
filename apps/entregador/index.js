import "./BackgroundLocation";
import React from "react";
import { registerRootComponent } from "expo";
import App from "./App";
import DriverProfessionalShell from "./DriverProfessionalShell";
import DriverDocumentsHost from "./DriverDocumentsHost";
import DriverFloatingBubbleHost from "./DriverFloatingBubbleHost";
import DriverHomeResetHost from "./DriverHomeResetHost";
import DriverIdleHomeShell from "./DriverIdleHomeShell";
import AccountLifecycleHost from "./AccountLifecycle";
import LegalConsentGate from "./LegalConsentGate";

function Root(){
  return <AccountLifecycleHost scheme="clickfood-entregador"><DriverFloatingBubbleHost><DriverHomeResetHost><DriverDocumentsHost><DriverProfessionalShell><DriverIdleHomeShell><App/></DriverIdleHomeShell></DriverProfessionalShell></DriverDocumentsHost></DriverHomeResetHost></DriverFloatingBubbleHost><LegalConsentGate/></AccountLifecycleHost>;
}

registerRootComponent(Root);