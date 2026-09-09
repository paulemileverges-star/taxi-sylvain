import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { playSound } from "../lib/sound.js";

function ClientCard({ client, onDelete }) {
  const [notes, setNotes] = useState(client.notes || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = notes !== (client.notes || "");

  const save = async () => {
    setSaving(true);
    try {
      await api.updateClientNotes(client.id, notes.trim() || null);
      playSound("action");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="row">
        <div>
          <div>{client.name}</div>
          <div style={{ color: "#8b99b5", fontSize: 13 }}>{client.email} · {client.phone}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="chip">★ {client.ratingAvg?.toFixed(1) ?? "5.0"}</span>
          <button className="btn red" onClick={() => onDelete(client)}>Supprimer</button>
        </div>
      </div>
      <label style={{ display: "block", marginTop: 12, fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Mémo et préférences (visible uniquement par le Dispatch)
      </label>
      <textarea
        className="input"
        style={{ marginTop: 6, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
        placeholder="ex. Préfère un véhicule spacieux, toujours 2 valises, allergique aux parfums, client fidèle du jeudi soir…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="row" style={{ marginTop: 6 }}>
        <span style={{ fontSize: 12, color: saved ? "#3fa796" : "var(--muted)" }}>
          {saved ? "Enregistré." : dirty ? "Modifications non enregistrées." : ""}
        </span>
        <button className="btn outline" disabled={!dirty || saving} onClick={save}>
          {saving ? "Enregistrement…" : "Enregistrer le mémo"}
        </button>
      </div>
    </div>
  );
}

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
        <ClientCard key={c.id} client={c} onDelete={remove} />
      ))}
      {clients.length === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucun client pour l'instant.</div>}
    </div>
  );
}
