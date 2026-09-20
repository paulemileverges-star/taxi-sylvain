import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { playSound } from "../lib/sound.js";
import AddressInput from "../components/AddressInput.jsx";

function PriceInput({ value, onChange }) {
  return (
    <input
      className="input"
      type="number"
      min="0"
      step="5"
      style={{ marginTop: 0, width: 96, textAlign: "right" }}
      value={value ?? ""}
      placeholder="—"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function ZoneRow({ zone, onSaved, onDeleted }) {
  const [draft, setDraft] = useState({ name: zone.name, priceYUL: zone.priceYUL ?? "", priceYHU: zone.priceYHU ?? "", priceREM: zone.priceREM ?? "" });
  const dirty =
    draft.name !== zone.name ||
    String(draft.priceYUL) !== String(zone.priceYUL ?? "") ||
    String(draft.priceYHU) !== String(zone.priceYHU ?? "") ||
    String(draft.priceREM) !== String(zone.priceREM ?? "");

  const save = async () => {
    await api.updatePriceZone(zone.id, { name: draft.name, priceYUL: draft.priceYUL, priceYHU: draft.priceYHU, priceREM: draft.priceREM });
    playSound("action");
    onSaved();
  };

  return (
    <tr>
      <td><input className="input" style={{ marginTop: 0 }} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
      <td><PriceInput value={draft.priceYUL} onChange={(v) => setDraft({ ...draft, priceYUL: v })} /></td>
      <td><PriceInput value={draft.priceYHU} onChange={(v) => setDraft({ ...draft, priceYHU: v })} /></td>
      <td><PriceInput value={draft.priceREM} onChange={(v) => setDraft({ ...draft, priceREM: v })} /></td>
      <td style={{ whiteSpace: "nowrap" }}>
        <button className="btn outline" disabled={!dirty} onClick={save}>Enregistrer</button>{" "}
        <button className="btn red" onClick={() => { if (window.confirm(`Retirer ${zone.name} de la grille ?`)) onDeleted(zone); }}>✕</button>
      </td>
    </tr>
  );
}

export default function Pricing() {
  const [destinations, setDestinations] = useState([]);
  const [zones, setZones] = useState([]);
  const [filter, setFilter] = useState("");
  const [newZone, setNewZone] = useState({ name: "", priceYUL: "", priceYHU: "", priceREM: "" });
  // Prix par défaut de chaque destination, par code. Il ne sert que si la municipalité du client
  // n'est pas dans la grille ci-dessous — sauf pour le REM, dont la grille est vide : là, ce prix
  // s'applique à tout le monde.
  const [prixDefaut, setPrixDefaut] = useState({});
  const [adresses, setAdresses] = useState({});
  const [message, setMessage] = useState("");

  const load = async () => {
    const [d, z] = await Promise.all([api.listDestinations(), api.listPriceZones()]);
    setDestinations(d);
    setZones(z);
    setPrixDefaut(Object.fromEntries(d.map((x) => [x.code, x.price ?? ""])));
    setAdresses(Object.fromEntries(d.map((x) => [x.code, x.address ?? ""])));
  };
  useEffect(() => { load(); }, []);

  const addZone = async () => {
    setMessage("");
    try {
      await api.createPriceZone(newZone);
      setNewZone({ name: "", priceYUL: "", priceYHU: "", priceREM: "" });
      playSound("action");
      load();
    } catch (e) {
      setMessage(e.message);
    }
  };

  const removeZone = async (zone) => {
    await api.deletePriceZone(zone.id);
    playSound("action");
    load();
  };

  const saveAdresse = async (code) => {
    const coords = adresses[`${code}_coords`];
    await api.updateDestination(code, { address: adresses[code], ...(coords ? { lat: coords.lat, lng: coords.lng } : {}) });
    playSound("action");
    load();
  };

  const savePrixDefaut = async (code) => {
    await api.updateDestination(code, { price: prixDefaut[code] });
    playSound("action");
    load();
  };

  const visible = zones.filter((z) => z.name.toLowerCase().normalize("NFD").includes(filter.toLowerCase().normalize("NFD")));

  return (
    <div>
      <h1>Tarifs</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, maxWidth: 720 }}>
        Le tarif d'une course vers YUL ou YHU est trouvé automatiquement à partir de la municipalité de l'adresse de prise en charge.
        Vous pouvez corriger un prix, ajouter une municipalité, ou laisser un prix vide (la course sera alors « à confirmer »).
      </p>

      <h3>Destinations prédéfinies</h3>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: -6 }}>
        Le prix par défaut ne sert que si la municipalité du client n'est pas dans la grille ci-dessous.
        Pour le REM, la grille n'a aucun prix : c'est donc ce prix par défaut qui s'applique à tout le monde.
        Un prix négocié inscrit sur la fiche d'un client passe avant tout le reste.
      </p>
      <div className="card">
        {destinations.map((d) => (
          <div key={d.code} className="row" style={{ padding: "6px 0", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div><strong>{d.code}</strong> — {d.label}</div>
              {/* L'adresse de la destination est celle que le chauffeur ouvre dans Waze : elle doit
                  pouvoir être corrigée ici, et passer par les suggestions pour rester exacte. */}
              <AddressInput
                value={adresses[d.code] ?? d.address ?? ""}
                onChange={({ address, lat, lng }) => setAdresses((a) => ({ ...a, [d.code]: address, [`${d.code}_coords`]: lat != null ? { lat, lng } : a[`${d.code}_coords`] }))}
                placeholder="Adresse de la destination"
              />
              <button className="btn outline" style={{ marginTop: 6 }} onClick={() => saveAdresse(d.code)}>Enregistrer l'adresse</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Prix par défaut ($)</span>
              <PriceInput value={prixDefaut[d.code] ?? ""} onChange={(v) => setPrixDefaut((p) => ({ ...p, [d.code]: v }))} />
              <button className="btn outline" onClick={() => savePrixDefaut(d.code)}>Enregistrer</button>
            </div>
          </div>
        ))}
      </div>

      <h3>Grille par municipalité de prise en charge</h3>
      <div className="card" style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label>Nouvelle municipalité</label>
          <input className="input" value={newZone.name} onChange={(e) => setNewZone({ ...newZone, name: e.target.value })} placeholder="ex. Saint-Constant" />
        </div>
        <div><label>Vers YUL ($)</label><PriceInput value={newZone.priceYUL} onChange={(v) => setNewZone({ ...newZone, priceYUL: v })} /></div>
        <div><label>Vers YHU ($)</label><PriceInput value={newZone.priceYHU} onChange={(v) => setNewZone({ ...newZone, priceYHU: v })} /></div>
        <div><label>Vers REM ($)</label><PriceInput value={newZone.priceREM} onChange={(v) => setNewZone({ ...newZone, priceREM: v })} /></div>
        <button className="btn" disabled={!newZone.name.trim()} onClick={addZone}>Ajouter</button>
      </div>
      {message && <div style={{ color: "#e85d4c", fontSize: 13, marginBottom: 8 }}>{message}</div>}

      <input className="input" placeholder="Filtrer (ex. Saint-Jean)…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginBottom: 10 }} />
      <div className="card" style={{ overflowX: "auto", padding: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", textAlign: "left" }}>
              <th style={{ padding: "6px 8px" }}>Municipalité</th>
              <th style={{ padding: "6px 8px" }}>Vers YUL</th>
              <th style={{ padding: "6px 8px" }}>Vers YHU</th>
              <th style={{ padding: "6px 8px" }}>Vers REM</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((z) => <ZoneRow key={z.id} zone={z} onSaved={load} onDeleted={removeZone} />)}
          </tbody>
        </table>
        {visible.length === 0 && <div style={{ color: "var(--muted)", fontSize: 14, padding: 8 }}>Aucune municipalité.</div>}
      </div>
    </div>
  );
}
