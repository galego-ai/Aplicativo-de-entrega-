import React from "react";
import { registerRootComponent } from "expo";
import App from "./App";
import NotificationHost from "./NotificationHost";
import OrderChatHost from "./OrderChatHost";

function Root(){
  return <NotificationHost app="CUSTOMER" appIdentifier="br.com.clickfood.cliente"><OrderChatHost><App/></OrderChatHost></NotificationHost>;
}

registerRootComponent(Root);
