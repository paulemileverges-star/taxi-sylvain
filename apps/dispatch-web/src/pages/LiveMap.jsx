import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../lib/api.js";
import { getSocket } from "../lib/socket.js";
import { STATUS_LABEL } from "../lib/status.js";

// Pastille colorée selon l'étape (ambre = vers le client, bleu = vers la destination) — évite les
// soucis classiques de chemin d'icônes par défaut de Leaflet avec les bundlers.
const ICON_COLOR = { EN_ROUTE: "#f5a623", STARTED: "#4f9dff" };
const iconCache = {};
function iconFor(status) {
  const color = ICON_COLOR[status] || "#f5a623";
  iconCache[color] ??= L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #0f1b2d;box-shadow:0 0 0 3px ${color}59;"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  });
  return iconCache[color];
}

const MONTREAL_CENTER = [45.5019, -73.5674];
const STALE_MS = 3 * 60 * 1000;

export default function LiveMap() {
  const [positions, setPositions] = useState({}); // driverId -> { lat, lng, name, rideId, status, at }
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // Positions déjà connues tout de suite, puis mises à jour en direct.
    api.driverLocations().then((list) => {
      setPositions(Object.fromEntries(list.map((p) => [p.driverId, p])));
    }).catch(() => null);

    const socket = getSocket();
    const onLocation = (p) => setPositions((prev) => ({ ...prev, [p.driverId]: p }));
    const onSnapshot = (list) => setPositions((prev) => ({ ...prev, ...Object.fromEntries(list.map((p) => [p.driverId, p])) }));
    const onClear = ({ driverId }) => setPositions((prev) => { const next = { ...prev }; delete next[driverId]; return next; });
    socket.on("driver:location", onLocation);
    socket.on("driver:locations", onSnapshot);
    socket.on("driver:location:clear", onClear);
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      socket.off("driver:location", onLocation);
      socket.off("driver:locations", onSnapshot);
      socket.off("driver:location:clear", onClear);
      clearInterval(tick);
    };
  }, []);

  const list = Object.values(positions);

  return (
    <div>
      <h1>Carte — Chauffeurs en direct</h1>
      <div style={{ color: "#8b99b5", fontSize: 13, marginBottom: 10 }}>
        Un chauffeur apparaît ici dès qu'il glisse « En route pour la course » ; ambre = vers le client, bleu = vers la destination.
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden", height: 560 }}>
        <MapContainer center={MONTREAL_CENTER} zoom={12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {list.map((p) => (
            <Marker key={p.driverId} position={[p.lat, p.lng]} icon={iconFor(p.status)} opacity={now - p.at > STALE_MS ? 0.45 : 1}>
              <Popup>
                <strong>{p.name}</strong>
                <br />
                {p.rideId ? (STATUS_LABEL[p.status] || "Course active") : ""}
                <br />
                Mise à jour : {new Date(p.at).toLocaleTimeString()}
                {now - p.at > STALE_MS && <><br /><em>Pas de position depuis plus de 3 min</em></>}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      {list.length === 0 && (
        <div style={{ color: "#8b99b5", fontSize: 14, marginTop: 10 }}>
          Aucun chauffeur en route pour l'instant.
        </div>
      )}
    </div>
  );
}
