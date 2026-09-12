import React, { useState } from "react";
import { api } from "../lib/api.js";

const ROLE_LABEL = { DISPATCH: "Dispatch", ADMIN: "Admin", DRIVER: "Chauffeur", CLIENT: "Client" };

function fmtDate(d) {
  return new Date(d).toLocaleDateString("fr-CA");
}

export default function Search() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async (e) => {
    e.preventDefault();
    if (q.trim().length < 2) {
      setError("Entrez au moins 2 caractères.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const r = await api.search(q.trim());
      setResults(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Recherche</h1>
      <form onSubmit={run} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
        <input
          className="input"
          style={{ marginTop: 0, flex: 1 }}
          placeholder="Nom, courriel, adresse de départ ou de destination…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <button className="btn" type="submit" disabled={loading}>{loading ? "Recherche…" : "Rechercher"}</button>
      </form>
      {error && <div style={{ color: "#e85d4c", fontSize: 13, marginTop: 8 }}>{error}</div>}

      {results && (
        <>
          <h3 style={{ marginTop: 24 }}>Comptes ({results.users.length})</h3>
          {results.users.length === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucun compte trouvé.</div>}
          {results.users.map((u) => (
            <div key={u.id} className="card row">
              <div>
                <div>{u.name}</div>
                <div style={{ color: "#8b99b5", fontSize: 13 }}>{u.email}</div>
              </div>
              <span className="chip">{ROLE_LABEL[u.role] || u.role}</span>
            </div>
          ))}

          <h3 style={{ marginTop: 24 }}>Courses ({results.rides.length})</h3>
          {results.rides.length === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucune course trouvée.</div>}
          {results.rides.map((r) => (
            <div key={r.id} className="card">
              <div className="row" style={{ marginBottom: 6 }}>
                <span className="chip">{r.status}</span>
                <span style={{ color: "#f5a623", fontWeight: 700 }}>{r.fare?.toFixed(2)} $</span>
              </div>
              <div className="field-row"><span className="field-label">Date :</span><span>{fmtDate(r.createdAt)}</span></div>
              <div className="field-row"><span className="field-label">Départ :</span><span>{r.pickupAddress}</span></div>
              <div className="field-row"><span className="field-label">Destination :</span><span>{r.destAddress}</span></div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
