import React, { useEffect, useRef, useState } from "react";
import { api, assetUrl } from "../lib/api.js";

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const photoInputs = useRef({});
  const carPhotoInputs = useRef({});

  const load = () => api.listDrivers().then(setDrivers);
  useEffect(() => { load(); }, []);

  const uploadPhoto = async (driverId, file) => {
    if (!file) return;
    await api.uploadDriverPhotos(driverId, { photo: file });
    load();
  };

  const uploadCarPhoto = async (driverId, file) => {
    if (!file) return;
    await api.uploadDriverPhotos(driverId, { carPhoto: file });
    load();
  };

  return (
    <div>
      <h1>Chauffeurs</h1>
      {drivers.map((d) => (
        <div key={d.id} className="card row">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", background: "#1d2c46", flexShrink: 0 }}>
              {d.photoUrl && <img src={assetUrl(d.photoUrl)} alt={d.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", background: "#1d2c46", flexShrink: 0 }}>
              {d.carPhotoUrl && <img src={assetUrl(d.carPhotoUrl)} alt="véhicule" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <span>{d.name} — {d.carModel} · {d.plate}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="chip">★ {d.ratingAvg?.toFixed(1) ?? "5.0"}</span>
            <button className="btn outline" onClick={() => photoInputs.current[d.id]?.click()}>Photo chauffeur</button>
            <input
              type="file" accept="image/*" style={{ display: "none" }}
              ref={(el) => (photoInputs.current[d.id] = el)}
              onChange={(e) => uploadPhoto(d.id, e.target.files[0])}
            />
            <button className="btn outline" onClick={() => carPhotoInputs.current[d.id]?.click()}>Photo véhicule</button>
            <input
              type="file" accept="image/*" style={{ display: "none" }}
              ref={(el) => (carPhotoInputs.current[d.id] = el)}
              onChange={(e) => uploadCarPhoto(d.id, e.target.files[0])}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
