import React from "react";
import { registerRootComponent } from "expo";
import App from "./App";
import NotificationHost from "./NotificationHost";

function Root(){
  return <NotificationHost app="CUSTOMER" appIdentifier="br.com.clickfood.cliente"><App/></NotificationHost>;
}

registerRootComponent(Root);
