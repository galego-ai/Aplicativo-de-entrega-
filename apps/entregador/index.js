import React from "react";
import { registerRootComponent } from "expo";
import App from "./App";
import NotificationHost from "./NotificationHost";
import DriverDocumentsHost from "./DriverDocumentsHost";
import OrderChatHost from "./OrderChatHost";
import DriverSupportHost from "./DriverSupportHost";
import DriverPayoutHost from "./DriverPayoutHost";

function Root(){
  return <NotificationHost app="DRIVER" appIdentifier="br.com.clickfood.entregador"><OrderChatHost><DriverDocumentsHost><DriverSupportHost><DriverPayoutHost><App/></DriverPayoutHost></DriverSupportHost></DriverDocumentsHost></OrderChatHost></NotificationHost>;
}

registerRootComponent(Root);
