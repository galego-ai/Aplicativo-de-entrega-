import React from "react";
import { registerRootComponent } from "expo";
import App from "./App";
import NotificationHost from "./NotificationHost";
import DriverDocumentsHost from "./DriverDocumentsHost";
import OrderChatHost from "./OrderChatHost";

function Root(){
  return <NotificationHost app="DRIVER" appIdentifier="br.com.clickfood.entregador"><OrderChatHost><DriverDocumentsHost><App/></DriverDocumentsHost></OrderChatHost></NotificationHost>;
}

registerRootComponent(Root);
