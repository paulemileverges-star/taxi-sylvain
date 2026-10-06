import React from "react";
import AddressInput from "./AddressInput.jsx";

// Arrêts entre la prise en charge et la destination (demande du propriétaire du 6 octobre 2026 :
// « mon client, puis l'ami de mon client, puis l'aéroport YUL »). Ordre modifiable, 5 au plus.
export const MAX_ARRETS = 5;
export const ARRET_VIDE = { address: "", lat: null, lng: null, confidence: null, placeId: null };

/** Les arrêts réellement saisis, prêts à envoyer au serveur. */
export function arretsAEnvoyer(arrets) {
  return (arrets || []).filter((a) => a.address && a.address.trim()).map((a) => ({
    address: a.address.trim(),
    lat: typeof a.lat === "number" ? a.lat : undefined,
    lng: typeof a.lng === "number" ? a.lng : undefined,
    confidence: a.confidence || undefined,
    placeId: a.placeId || undefined,
  }));
}

export default function ArretsEditor({ arrets, onChange }) {
  const liste = arrets || [];
  const changer = (i, valeur) => onChange(liste.map((a, j) => (j === i ? { ...ARRET_VIDE, ...valeur } : a)));
  const retirer = (i) => onChange(liste.filter((_, j) => j !== i));
  const deplacer = (i, sens) => {
    const j = i + sens;
    if (j < 0 || j >= liste.length) return;
    const copie = [...liste];
    [copie[i], copie[j]] = [copie[j], copie[i]];
    onChange(copie);
  };
  const petit = { padding: "2px 8px", fontSize: 12 };

  return (
    <div style={{ marginTop: 8 }}>
      {liste.map((a, i) => (
        <div key={i} style={{ borderLeft: "3px solid var(--amber)", paddingLeft: 8, marginTop: 6 }}>
          <AddressInput
            label={`Arrêt ${i + 1}`}
            value={a.address}
            point={a}
            placeholder="Adresse de l'arrêt (ex. l'ami du client)"
            onChange={(v) => changer(i, v)}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button type="button" className="btn outline" style={petit} disabled={i === 0} onClick={() => deplacer(i, -1)} title="Monter">↑</button>
            <button type="button" className="btn outline" style={petit} disabled={i === liste.length - 1} onClick={() => deplacer(i, 1)} title="Descendre">↓</button>
            <button type="button" className="btn red" style={petit} onClick={() => retirer(i)}>Retirer l'arrêt</button>
          </div>
        </div>
      ))}
      {liste.length < MAX_ARRETS && (
        <button type="button" className="btn outline" style={{ marginTop: 8 }} onClick={() => onChange([...liste, { ...ARRET_VIDE }])}>
          + Ajouter un arrêt
        </button>
      )}
      {liste.length > 0 && (
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
          Le chauffeur passera par {liste.length > 1 ? "ces arrêts, dans cet ordre," : "cet arrêt"} avant la destination.
        </div>
      )}
    </div>
  );
}
