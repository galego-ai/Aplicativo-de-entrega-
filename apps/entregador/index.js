import React from "react";
import { registerRootComponent } from "expo";
import App from "./App";
import NotificationHost from "./NotificationHost";
import DriverDocumentsHost from "./DriverDocumentsHost";

function Root(){
  return <NotificationHost app="DRIVER" appIdentifier="br.com.clickfood.entregador"><DriverDocumentsHost><App/></DriverDocumentsHost></NotificationHost>;
}

registerRootComponent(Root);
