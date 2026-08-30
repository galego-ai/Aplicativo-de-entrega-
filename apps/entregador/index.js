import React from "react";
import { registerRootComponent } from "expo";
import App from "./App";
import NotificationHost from "./NotificationHost";

function Root(){
  return <NotificationHost app="DRIVER" appIdentifier="br.com.clickfood.entregador"><App/></NotificationHost>;
}

registerRootComponent(Root);
