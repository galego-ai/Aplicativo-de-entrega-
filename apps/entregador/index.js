import React from "react";
import { registerRootComponent } from "expo";
import App from "./App";
import NotificationHost from "./NotificationHost";
import DriverDocumentsHost from "./DriverDocumentsHost";
import OrderChatHost from "./OrderChatHost";
import DriverSupportHost from "./DriverSupportHost";

function Root(){
  return <NotificationHost app="DRIVER" appIdentifier="br.com.clickfood.entregador"><OrderChatHost><DriverDocumentsHost><DriverSupportHost><App/></DriverSupportHost></DriverDocumentsHost></OrderChatHost></NotificationHost>;
}

registerRootComponent(Root);
