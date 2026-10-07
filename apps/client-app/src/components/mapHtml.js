const MONTREAL_CENTER = [45.5019, -73.5674];

// Carte Leaflet + OpenStreetMap (aucune clé API requise), partagée entre la variante
// WebView (mobile) et la variante iframe (web) de DriverMap.
//
// Audit du 7 octobre 2026 (F18) : le crédit d'OpenStreetMap avait été retiré, alors que sa licence
// l'exige ; il est rétabli, lisible et cliquable. Les fichiers de Leaflet chargés depuis unpkg sont
// vérifiés par leur empreinte (intégrité), et une carte qui ne peut pas se charger le dit au lieu de
// rester grise.
export const MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:#1d2c46;}
  .indisponible{color:#8b99b5;font:13px sans-serif;display:flex;align-items:center;justify-content:center;height:100%;text-align:center;padding:0 12px;}
  .leaflet-control-attribution{font-size:10px;}
</style>
</head>
<body>
<div id="map"></div>
<script>
  function carteIndisponible() {
    document.getElementById('map').innerHTML = '<div class="indisponible">Carte indisponible pour le moment. La position du chauffeur reste suivie par Taxi Sylvain.</div>';
  }
</script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="" onerror="carteIndisponible()"></script>
<script>
  var marker = null;
  window.updatePosition = function() {};
  if (window.L) {
    var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([${MONTREAL_CENTER[0]}, ${MONTREAL_CENTER[1]}], 12);
    map.attributionControl.setPrefix(false);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">contributeurs OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    var icon = L.divIcon({
      className: '',
      html: '<div style="width:16px;height:16px;border-radius:50%;background:#f5a623;border:2px solid #0f1b2d;box-shadow:0 0 0 3px rgba(245,166,35,0.35);"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    window.updatePosition = function(lat, lng) {
      if (!marker) {
        marker = L.marker([lat, lng], { icon: icon }).addTo(map);
      } else {
        marker.setLatLng([lat, lng]);
      }
      map.setView([lat, lng], Math.max(map.getZoom(), 14));
    };
  } else {
    carteIndisponible();
  }
</script>
</body>
</html>
`;
