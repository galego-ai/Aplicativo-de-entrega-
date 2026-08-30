import React from "react";
import { registerRootComponent } from "expo";
import App from "./App";
import NotificationHost from "./NotificationHost";
import OrderChatHost from "./OrderChatHost";
import AccountLifecycleHost from "./AccountLifecycle";
import LegalConsentGate from "./LegalConsentGate";

function Root(){
  return <AccountLifecycleHost scheme="clickfood-cliente"><NotificationHost app="CUSTOMER" appIdentifier="br.com.clickfood.cliente"><OrderChatHost><App/><LegalConsentGate/></OrderChatHost></NotificationHost></AccountLifecycleHost>;
}

registerRootComponent(Root);
