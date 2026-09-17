import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { getSocket } from "../lib/socket.js";
import { playSound } from "../lib/sound.js";
import RideEditModal from "../components/RideEditModal.jsx";

export default function Messages({ unread = {}, onRead }) {
  const [drivers, setDrivers] = useState([]);
  const [activeDriverId, setActiveDriverId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [openRideId, setOpenRideId] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.listDrivers().then((d) => {
      setDrivers(d);
      // Ouvre d'abord le chauffeur qui a des messages non lus, sinon le premier.
      const firstUnread = d.find((x) => unread[x.id]);
      if (d.length > 0) setActiveDriverId((firstUnread || d[0]).id);
    });
  }, []);

  const markRead = (driverId) => api.markThreadRead(`direct:${driverId}`).then(() => onRead?.()).catch(() => null);

  useEffect(() => {
    if (!activeDriverId) return;
    api.listDirectMessages(activeDriverId).then(setMessages).then(() => markRead(activeDriverId));
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

  const send = async () => {
    if (!draft.trim() || !activeDriverId) return;
    await api.sendDirectMessage(activeDriverId, draft);
    setDraft("");
    playSound("action");
  };

  const activeDriver = drivers.find((d) => d.id === activeDriverId);

  return (
    <div>
      <h1>Messagerie — Chauffeurs</h1>
      <div className="messages-layout">
        <div className="card messages-driverlist" style={{ padding: 8, overflowY: "auto" }}>
          {drivers.map((d) => (
            <button
              key={d.id}
              onClick={() => setActiveDriverId(d.id)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left", padding: "10px 12px",
                background: activeDriverId === d.id ? "rgba(245,166,35,0.1)" : "transparent",
                border: "none", borderRadius: 8, color: "var(--text)", cursor: "pointer", marginBottom: 4,
                fontWeight: unread[d.id] ? 700 : 400,
              }}
            >
              <span>{d.name}</span>
              {unread[d.id] ? <span className="unread-badge">{unread[d.id]}</span> : null}
            </button>
          ))}
          {drivers.length === 0 && <div style={{ color: "#8b99b5", fontSize: 13, padding: 8 }}>Aucun chauffeur.</div>}
        </div>

        <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{activeDriver ? activeDriver.name : "Sélectionnez un chauffeur"}</div>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {messages.map((m) => (
              <div key={m.id} style={{ alignSelf: m.sender.role === "DISPATCH" ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                <div
                  style={{
                    padding: "8px 12px", borderRadius: 14, fontSize: 14,
                    background: m.sender.role === "DISPATCH" ? "var(--amber)" : "#1d2c46",
                    color: m.sender.role === "DISPATCH" ? "#1a1200" : "var(--text)",
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
            <input
              className="input" style={{ marginTop: 0 }}
              placeholder="Écrire un message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            />
            <button className="btn" onClick={send}>Envoyer</button>
          </div>
        </div>
      </div>
      {openRideId && <RideEditModal rideId={openRideId} onClose={() => setOpenRideId(null)} />}
    </div>
  );
}
