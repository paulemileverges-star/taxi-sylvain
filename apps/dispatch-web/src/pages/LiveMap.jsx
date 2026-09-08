import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getSocket } from "../lib/socket.js";

// Marqueur simple en forme de pastille ambre — évite les soucis classiques de chemin d'icônes
// par défaut de Leaflet avec les bundlers (Vite ne sert pas ses images automatiquement).
const driverIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#f5a623;border:2px solid #0f1b2d;box-shadow:0 0 0 3px rgba(245,166,35,0.35);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -10],
});

const MONTREAL_CENTER = [45.5019, -73.5674];

const STATUS_LABEL = {
  EN_ROUTE: "En route vers le client",
  STARTED: "En route vers la destination",
};

export default function LiveMap() {
  const [positions, setPositions] = useState({}); // driverId -> { lat, lng, name, rideId, at }

  useEffect(() => {
    const socket = getSocket();
    const onLocation = (p) => {
      setPositions((prev) => ({ ...prev, [p.driverId]: p }));
    };
    socket.on("driver:location", onLocation);
    return () => socket.off("driver:location", onLocation);
  }, []);

  const list = Object.values(positions);

  return (
    <div>
      <h1>Carte — Chauffeurs en direct</h1>
      <div className="text-muted" style={{ color: "#8b99b5", fontSize: 13, marginBottom: 10 }}>
        Un chauffeur apparaît ici dès qu'il clique « En route pour la course » ou « Démarrer la course » dans son app.
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden", height: 560 }}>
        <MapContainer center={MONTREAL_CENTER} zoom={12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {list.map((p) => (
            <Marker key={p.driverId} position={[p.lat, p.lng]} icon={driverIcon}>
              <Popup>
                <strong>{p.name}</strong>
                <br />
                {p.rideId ? (STATUS_LABEL[p.status] || "Course active") : ""}
                <br />
                Mise à jour : {new Date(p.at).toLocaleTimeString()}
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
