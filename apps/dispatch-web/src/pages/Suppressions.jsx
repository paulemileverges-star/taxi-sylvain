import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { getSocket } from "../lib/socket.js";
import { playSound } from "../lib/sound.js";

// Demandes de suppression de compte (décision du propriétaire du 20 septembre 2026) : un client ou
// un chauffeur demande, le Dispatch valide ou refuse ici. Réponse promise sous 30 jours dans les
// pages légales : la date limite est affichée pour chaque demande.
const ROLE = { CLIENT: "Client", DRIVER: "Chauffeur" };
const fmtDate = (d) => new Date(d).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });
const fmtJour = (d) => new Date(d).toLocaleDateString("fr-CA", { dateStyle: "long" });

export default function Suppressions({ onChanged }) {
  const [demandes, setDemandes] = useState([]);
  const [error, setError] = useState("");
  const [enCours, setEnCours] = useState(null);

  const load = () =>
    api.listDeletionRequests()
      .then((liste) => { setDemandes(liste); onChanged?.(liste.length); })
      .catch((e) => setError(e.message));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => load();
    socket.on("account:deletion-changed", refresh);
    return () => socket.off("account:deletion-changed", refresh);
  }, []);

  const valider = async (d) => {
    const texte = `Supprimer définitivement le compte de ${d.name} (${ROLE[d.role] || d.role}) ?\n\n` +
      (d.role === "CLIENT"
        ? "Ses courses à venir sans chauffeur seront annulées. Refusé tant qu'une de ses courses est acceptée ou en cours."
        : "Ses courses non terminées repasseront en attente d'un chauffeur. Ses récapitulatifs hebdomadaires seront effacés.") +
      "\n\nCette action ne peut pas être annulée.";
    if (!window.confirm(texte)) return;
    setError("");
    setEnCours(d.id);
    try {
      await api.approveDeletion(d.id);
      playSound("action");
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnCours(null);
    }
  };

  const refuser = async (d) => {
    const raison = window.prompt(`Refuser la demande de ${d.name}. Raison transmise par courriel à la personne (facultatif) :`, "");
    if (raison === null) return;
    setError("");
    setEnCours(d.id);
    try {
      await api.refuseDeletion(d.id, raison);
      playSound("action");
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div>
      <div className="row">
        <h1>Demandes de suppression de compte</h1>
      </div>
      <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
        Une personne qui demande la suppression de son compte garde l'usage de l'application jusqu'à votre décision, et peut annuler sa demande.
        Les pages légales promettent une réponse sous 30 jours. À la validation, le compte est effacé et la personne reçoit un courriel ; au refus, elle reçoit la raison.
      </div>
      {error && <div style={{ color: "#e85d4c", fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {demandes.map((d) => (
        <div key={d.id} className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <div>
              <span className="chip" style={{ marginRight: 8 }}>{ROLE[d.role] || d.role}</span>
              <strong>{d.name}</strong>
              <div style={{ color: "#8b99b5", fontSize: 13 }}>{d.email || "(pas de courriel : aucun courriel de décision ne partira)"} · {d.phone}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn outline" disabled={enCours === d.id} onClick={() => refuser(d)}>Refuser</button>
              <button className="btn red" disabled={enCours === d.id} onClick={() => valider(d)}>{enCours === d.id ? "En cours…" : "Valider la suppression"}</button>
            </div>
          </div>
          <div className="field-row"><span className="field-label">Demandée le :</span><span>{fmtDate(d.deletionRequestedAt)} ({d.deletionRequestVia === "web" ? "page web" : "application"})</span></div>
          <div className="field-row"><span className="field-label">À traiter avant le :</span><span>{fmtJour(d.deadline)}</span></div>
          <div className="field-row">
            <span className="field-label">Courses acceptées ou en cours :</span>
            <span style={{ color: d.coursesEnCours ? "#f5a623" : "inherit" }}>
              {d.coursesEnCours || "aucune"}{d.coursesEnCours && d.role === "CLIENT" ? " (la validation sera refusée tant qu'elle n'est pas terminée)" : ""}
            </span>
          </div>
        </div>
      ))}
      {demandes.length === 0 && !error && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucune demande en attente.</div>}
    </div>
  );
}
