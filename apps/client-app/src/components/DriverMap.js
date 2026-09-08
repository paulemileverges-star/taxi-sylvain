import React, { useEffect, useRef } from "react";
import { WebView } from "react-native-webview";

const MONTREAL_CENTER = [45.5019, -73.5674];

// Carte Leaflet + OpenStreetMap embarquée dans une WebView (aucune clé API requise,
// cohérent avec la carte du Dispatch). La position se met à jour via injectJavaScript
// plutôt que postMessage pour éviter les différences de bridge Android/iOS.
const HTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>html,body,#map{height:100%;margin:0;padding:0;background:#1d2c46;}</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${MONTREAL_CENTER[0]}, ${MONTREAL_CENTER[1]}], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  var icon = L.divIcon({
    className: '',
    html: '<div style="width:16px;height:16px;border-radius:50%;background:#f5a623;border:2px solid #0f1b2d;box-shadow:0 0 0 3px rgba(245,166,35,0.35);"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
  var marker = null;
  window.updatePosition = function(lat, lng) {
    if (!marker) {
      marker = L.marker([lat, lng], { icon: icon }).addTo(map);
    } else {
      marker.setLatLng([lat, lng]);
    }
    map.setView([lat, lng], Math.max(map.getZoom(), 14));
  };
</script>
</body>
</html>
`;

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
      source={{ html: HTML }}
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
