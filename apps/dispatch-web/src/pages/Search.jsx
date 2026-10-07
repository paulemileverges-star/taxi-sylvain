import React, { useState } from "react";
import { api } from "../lib/api.js";
import RideEditModal from "../components/RideEditModal.jsx";
import { STATUS_LABEL, statusClass } from "../lib/status.js";
import { jourHeure } from "../lib/heure.js";

const ROLE_LABEL = { DISPATCH: "Dispatch", ADMIN: "Admin", DRIVER: "Chauffeur", CLIENT: "Client" };

// Audit du 7 octobre 2026 (F20) : statuts en anglais et date de SAISIE à l'heure de l'ordinateur ;
// désormais les libellés et la date de la course (heure de Montréal) des autres pages.
export default function Search({ user }) {
  const peutModifierCourses = user?.role === "DISPATCH" || Boolean(user?.permissions?.includes("courses"));
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openRideId, setOpenRideId] = useState(null);

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
          aria-label="Rechercher"
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
                <span className={`chip status-chip ${statusClass(r.status)}`}>{STATUS_LABEL[r.status] || r.status}</span>
                <span style={{ color: "#f5a623", fontWeight: 700 }}>{r.fare > 0 ? `${r.fare.toFixed(2)} $` : "Montant à confirmer"}</span>
              </div>
              <div className="field-row"><span className="field-label">Date de la course :</span><span>{jourHeure(r.scheduledFor || r.createdAt)}</span></div>
              <div className="field-row"><span className="field-label">Départ :</span><span>{r.pickupAddress}</span></div>
              <div className="field-row"><span className="field-label">Destination :</span><span>{r.destAddress}</span></div>
              {peutModifierCourses && <button className="btn outline" style={{ marginTop: 8 }} onClick={() => setOpenRideId(r.id)}>Ouvrir la course</button>}
            </div>
          ))}
        </>
      )}
      {openRideId && <RideEditModal rideId={openRideId} onClose={() => setOpenRideId(null)} onSaved={(e) => run(e || { preventDefault() {} })} />}
    </div>
  );
}
