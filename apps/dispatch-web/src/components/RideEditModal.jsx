import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { playSound } from "../lib/sound.js";
import { STATUS_LABEL, statusClass, localInputToIso, isoToLocalInput } from "../lib/status.js";
import AddressInput from "./AddressInput.jsx";

// Modale de correction rapide d'une course — ouverte depuis le lien "Voir la course" d'un
// message lié à une course (Messagerie) ou depuis un créneau de la cédule (Cédule).
export default function RideEditModal({ rideId, onClose, onSaved }) {
  const [ride, setRide] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getRide(rideId).then((r) => {
      setRide(r);
      setForm({
        pickupAddress: r.pickupAddress || "",
        destAddress: r.destAddress || "",
        pickupLat: null, pickupLng: null, destLat: null, destLng: null,
        fare: r.fare ?? "",
        flightNumber: r.flightNumber || "",
        scheduledFor: isoToLocalInput(r.scheduledFor),
      });
    });
  }, [rideId]);

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      await api.updateRide(rideId, {
        pickupAddress: form.pickupAddress,
        destAddress: form.destAddress,
        // Coordonnées envoyées seulement si l'adresse vient d'être choisie dans la liste ;
        // sinon le serveur géocode lui-même la nouvelle adresse.
        ...(typeof form.pickupLat === "number" ? { pickupLat: form.pickupLat, pickupLng: form.pickupLng } : {}),
        ...(typeof form.destLat === "number" ? { destLat: form.destLat, destLng: form.destLng } : {}),
        fare: Number(form.fare),
        flightNumber: form.flightNumber || null,
        scheduledFor: localInputToIso(form.scheduledFor),
      });
      playSound("action");
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="row"><h3>Modifier la course</h3><button onClick={onClose}>✕</button></div>
        {!form ? (
          <div style={{ color: "#8b99b5" }}>Chargement…</div>
        ) : (
          <>
            {ride?.client?.name && <div className="field-row"><span className="field-label">Client :</span><span>{ride.client.name}</span></div>}
            {ride?.driver?.name && <div className="field-row"><span className="field-label">Chauffeur :</span><span>{ride.driver.name}</span></div>}
            <div className="field-row"><span className="field-label">Statut :</span><span className={`chip status-chip ${statusClass(ride?.status)}`}>{STATUS_LABEL[ride?.status] || ride?.status}</span></div>
            {ride?.distanceKm != null && <div className="field-row"><span className="field-label">Distance :</span><span>{ride.distanceKm.toFixed(1)} km</span></div>}
            {ride?.ratings?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className="field-label" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Avis reçus</div>
                {ride.ratings.map((r) => (
                  <div key={r.id} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ color: "#f5a623" }}>{"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</span>
                    {" "}<span style={{ color: "var(--muted)" }}>{r.fromUserId === ride.clientId ? "du client sur le chauffeur" : "du chauffeur sur le client"}</span>
                    {r.comment && <div>« {r.comment} »</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Corriger une adresse passe par les suggestions, comme à la création : sinon une
                adresse corrigée à la main repart sans coordonnées et la carte montre le mauvais
                point. Le serveur la géocode alors, mais autant partir d'une adresse exacte. */}
            <AddressInput
              label="Adresse de prise en charge"
              value={form.pickupAddress}
              onChange={({ address, lat, lng }) => setForm({ ...form, pickupAddress: address, pickupLat: lat, pickupLng: lng })}
            />
            <AddressInput
              label="Adresse de destination"
              value={form.destAddress}
              onChange={({ address, lat, lng }) => setForm({ ...form, destAddress: address, destLat: lat, destLng: lng })}
            />
            <label style={{ display: "block", marginTop: 8 }}>Heure de prise en charge du client</label>
            <input className="input" type="datetime-local" value={form.scheduledFor} onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Numéro de vol</label>
            <input className="input" value={form.flightNumber} onChange={(e) => setForm({ ...form, flightNumber: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Montant prévu ($)</label>
            <input className="input" value={form.fare} onChange={(e) => setForm({ ...form, fare: e.target.value })} />
            {error && <div style={{ color: "#e85d4c", fontSize: 13, marginTop: 8 }}>{error}</div>}
            <button className="btn" style={{ marginTop: 14, width: "100%" }} disabled={saving} onClick={save}>
              {saving ? "Enregistrement…" : "Enregistrer les corrections"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
