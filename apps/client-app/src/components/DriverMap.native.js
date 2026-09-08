import React, { useEffect, useRef } from "react";
import { WebView } from "react-native-webview";
import { MAP_HTML } from "./mapHtml";

// WebView réservée à iOS/Android — react-native-webview ne supporte pas le web
// (voir DriverMap.web.js pour la variante navigateur, en iframe).
export default function DriverMap({ lat, lng }) {
  const webviewRef = useRef(null);
  const ready = useRef(false);

  useEffect(() => {
    if (lat == null || lng == null || !ready.current) return;
    webviewRef.current?.injectJavaScript(`window.updatePosition(${lat}, ${lng}); true;`);
  }, [lat, lng]);

  return (
    <WebView
      ref={webviewRef}
      source={{ html: MAP_HTML }}
      style={{ flex: 1, alignSelf: "stretch", backgroundColor: "#1d2c46" }}
      onLoadEnd={() => {
        ready.current = true;
        if (lat != null && lng != null) {
          webviewRef.current?.injectJavaScript(`window.updatePosition(${lat}, ${lng}); true;`);
        }
      }}
    />
  );
}
