import React, { useEffect, useRef } from "react";
import { MAP_HTML } from "./mapHtml";

// Variante web — react-native-webview ne fonctionne pas dans un navigateur, mais
// react-native-web rend un vrai DOM, donc un <iframe> classique fait l'affaire.
export default function DriverMap({ lat, lng }) {
  const iframeRef = useRef(null);
  const ready = useRef(false);

  useEffect(() => {
    if (lat == null || lng == null || !ready.current) return;
    iframeRef.current?.contentWindow?.updatePosition?.(lat, lng);
  }, [lat, lng]);

  return (
    <iframe
      ref={iframeRef}
      title="Position du chauffeur"
      srcDoc={MAP_HTML}
      style={{ border: 0, width: "100%", height: "100%" }}
      onLoad={() => {
        ready.current = true;
        if (lat != null && lng != null) {
          iframeRef.current?.contentWindow?.updatePosition?.(lat, lng);
        }
      }}
    />
  );
}
