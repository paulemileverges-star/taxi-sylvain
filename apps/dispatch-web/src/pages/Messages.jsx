import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { getSocket } from "../lib/socket.js";
import { playSound } from "../lib/sound.js";
import RideEditModal from "../components/RideEditModal.jsx";

const EQUIPE = ["DISPATCH", "ADMIN"];

// Audit du 7 octobre 2026 (F23) : changer de chauffeur gardait affichés les messages du précédent,
// une réponse lente du fil A pouvait remplacer le fil B sous le nom de B, et un brouillon commencé pour
// A partait à B. Désormais : messages vidés au changement de fil, réponse périmée ignorée, un
// brouillon par chauffeur, et l'envoi part toujours au chauffeur du brouillon.
export default function Messages({ unread = {}, onRead }) {
  const [drivers, setDrivers] = useState([]);
  const [activeDriverId, setActiveDriverId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");
  const [brouillons, setBrouillons] = useState({});
  const [envoi, setEnvoi] = useState(false);
  const [openRideId, setOpenRideId] = useState(null);
  const bottomRef = useRef(null);
  const filDemande = useRef(null);

  useEffect(() => {
    // Liste minimale des chauffeurs : la Messagerie n'exige pas la permission Chauffeurs (F04).
    api.listDriverChoices().then((d) => {
      setDrivers(d);
      // Ouvre d'abord le chauffeur qui a des messages non lus, sinon le premier.
      const firstUnread = d.find((x) => unread[x.id]);
      if (d.length > 0) setActiveDriverId((firstUnread || d[0]).id);
    }).catch((e) => setErreur(e.message || "Liste des chauffeurs indisponible."));
  }, []);

  const markRead = (driverId) => api.markThreadRead(`direct:${driverId}`).then(() => onRead?.()).catch(() => null);

  useEffect(() => {
    if (!activeDriverId) return;
    filDemande.current = activeDriverId;
    setMessages([]);
    setErreur("");
    setChargement(true);
    api.listDirectMessages(activeDriverId)
      .then((liste) => {
        if (filDemande.current !== activeDriverId) return; // réponse d'un fil quitté entre-temps
        setMessages(liste);
        markRead(activeDriverId);
      })
      .catch((e) => { if (filDemande.current === activeDriverId) setErreur(e.message || "Messages indisponibles."); })
      .finally(() => { if (filDemande.current === activeDriverId) setChargement(false); });
  }, [activeDriverId]);

  useEffect(() => {
    const socket = getSocket();
    const onDirect = (msg) => {
      if (msg.driverId !== activeDriverId) return;
      setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]));
      if (msg.sender.role === "DRIVER") markRead(activeDriverId);
    };
    socket.on("message:direct", onDirect);
    return () => socket.off("message:direct", onDirect);
  }, [activeDriverId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const draft = (activeDriverId && brouillons[activeDriverId]) || "";
  const setDraft = (texte) => setBrouillons((b) => ({ ...b, [activeDriverId]: texte }));

  const send = async () => {
    const destinataire = activeDriverId;
    const texte = (brouillons[destinataire] || "").trim();
    if (!texte || !destinataire || envoi) return;
    setEnvoi(true);
    try {
      await api.sendDirectMessage(destinataire, texte);
      setBrouillons((b) => ({ ...b, [destinataire]: "" }));
      playSound("action");
    } catch (e) {
      window.alert(e.message || "Message non envoyé.");
    } finally {
      setEnvoi(false);
    }
  };

  const activeDriver = drivers.find((d) => d.id === activeDriverId);

  return (
    <div>
      <h1>Messagerie — Chauffeurs</h1>
      {erreur && <div className="card" role="alert" style={{ color: "#e85d4c" }}>{erreur}</div>}
      <div className="messages-layout">
        <div className="card messages-driverlist" style={{ padding: 8, overflowY: "auto" }}>
          {drivers.map((d) => (
            <button
              key={d.id}
              onClick={() => setActiveDriverId(d.id)}
              aria-current={activeDriverId === d.id ? "true" : undefined}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left", padding: "10px 12px",
                background: activeDriverId === d.id ? "rgba(245,166,35,0.1)" : "transparent",
                border: "none", borderRadius: 8, color: "var(--text)", cursor: "pointer", marginBottom: 4,
                fontWeight: unread[d.id] ? 700 : 400,
              }}
            >
              <span>{d.name}{brouillons[d.id]?.trim() ? " ✎" : ""}</span>
              {unread[d.id] ? <span className="unread-badge">{unread[d.id]}</span> : null}
            </button>
          ))}
          {drivers.length === 0 && <div style={{ color: "#8b99b5", fontSize: 13, padding: 8 }}>Aucun chauffeur.</div>}
        </div>

        <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{activeDriver ? activeDriver.name : "Sélectionnez un chauffeur"}</div>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }} aria-live="polite">
            {chargement && <div style={{ color: "var(--muted)", fontSize: 13 }}>Chargement des messages…</div>}
            {!chargement && messages.length === 0 && activeDriver && <div style={{ color: "var(--muted)", fontSize: 13 }}>Aucun message avec {activeDriver.name}.</div>}
            {messages.map((m) => (
              <div key={m.id} style={{ alignSelf: EQUIPE.includes(m.sender.role) ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                <div
                  style={{
                    padding: "8px 12px", borderRadius: 14, fontSize: 14,
                    background: EQUIPE.includes(m.sender.role) ? "var(--amber)" : "#1d2c46",
                    color: EQUIPE.includes(m.sender.role) ? "#1a1200" : "var(--text)",
                  }}
                >
                  {m.text}
                </div>
                {m.ride && (
                  <button
                    onClick={() => setOpenRideId(m.ride.id)}
                    style={{
                      background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4,
                      color: "var(--amber)", fontSize: 11, textDecoration: "underline",
                    }}
                  >
                    Voir la course : {m.ride.pickupAddress} → {m.ride.destAddress}
                  </button>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <label htmlFor="message-direct" style={{ position: "absolute", left: -9999 }}>Message à {activeDriver?.name || "ce chauffeur"}</label>
            <input
              id="message-direct"
              className="input" style={{ marginTop: 0 }}
              placeholder={activeDriver ? `Écrire à ${activeDriver.name}…` : "Écrire un message…"}
              value={draft}
              disabled={!activeDriverId}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            />
            <button className="btn" onClick={send} disabled={envoi || !draft.trim()}>{envoi ? "Envoi…" : "Envoyer"}</button>
          </div>
        </div>
      </div>
      {openRideId && <RideEditModal rideId={openRideId} onClose={() => setOpenRideId(null)} />}
    </div>
  );
}
