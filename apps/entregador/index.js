import React from "react";
import { registerRootComponent } from "expo";
import App from "./App";
import NotificationHost from "./NotificationHost";
import DriverDocumentsHost from "./DriverDocumentsHost";
import OrderChatHost from "./OrderChatHost";
import DriverSupportHost from "./DriverSupportHost";
import DriverPayoutHost from "./DriverPayoutHost";
import AccountLifecycleHost from "./AccountLifecycle";
import LegalConsentGate from "./LegalConsentGate";

function Root(){
  return <AccountLifecycleHost scheme="clickfood-entregador"><NotificationHost app="DRIVER" appIdentifier="br.com.clickfood.entregador"><OrderChatHost><DriverDocumentsHost><DriverSupportHost><DriverPayoutHost><App/><LegalConsentGate/></DriverPayoutHost></DriverSupportHost></DriverDocumentsHost></OrderChatHost></NotificationHost></AccountLifecycleHost>;
}

registerRootComponent(Root);
