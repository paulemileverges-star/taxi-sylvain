import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { playSound } from "../lib/sound.js";

export default function Clients() {
  const [clients, setClients] = useState([]);

  const load = () => api.listClients().then(setClients);
  useEffect(() => { load(); }, []);

  const remove = async (client) => {
    if (!window.confirm(`Supprimer le compte de ${client.name} ? Cette action est définitive.`)) return;
    await api.deleteClient(client.id);
    playSound("action");
    load();
  };

  return (
    <div>
      <h1>Clients</h1>
      {clients.map((c) => (
        <div key={c.id} className="card row">
          <div>
            <div>{c.name}</div>
            <div style={{ color: "#8b99b5", fontSize: 13 }}>{c.email} · {c.phone}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="chip">★ {c.ratingAvg?.toFixed(1) ?? "5.0"}</span>
            <button className="btn red" onClick={() => remove(c)}>Supprimer</button>
          </div>
        </div>
      ))}
      {clients.length === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucun client pour l'instant.</div>}
    </div>
  );
}
