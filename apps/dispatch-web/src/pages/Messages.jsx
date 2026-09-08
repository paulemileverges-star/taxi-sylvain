import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { getSocket } from "../lib/socket.js";

export default function Messages() {
  const [drivers, setDrivers] = useState([]);
  const [activeDriverId, setActiveDriverId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    api.listDrivers().then((d) => {
      setDrivers(d);
      if (d.length > 0) setActiveDriverId(d[0].id);
    });
  }, []);

  useEffect(() => {
    if (!activeDriverId) return;
    api.listDirectMessages(activeDriverId).then(setMessages);
  }, [activeDriverId]);

  useEffect(() => {
    const socket = getSocket();
    const onDirect = (msg) => {
      if (msg.driverId === activeDriverId) setMessages((prev) => [...prev, msg]);
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
  };

  const activeDriver = drivers.find((d) => d.id === activeDriverId);

  return (
    <div>
      <h1>Messagerie — Chauffeurs</h1>
      <div style={{ display: "flex", gap: 16, height: 560 }}>
        <div className="card" style={{ width: 220, padding: 8, overflowY: "auto" }}>
          {drivers.map((d) => (
            <button
              key={d.id}
              onClick={() => setActiveDriverId(d.id)}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "10px 12px",
                background: activeDriverId === d.id ? "rgba(245,166,35,0.1)" : "transparent",
                border: "none", borderRadius: 8, color: "var(--text)", cursor: "pointer", marginBottom: 4,
              }}
            >
              {d.name}
            </button>
          ))}
          {drivers.length === 0 && <div style={{ color: "#8b99b5", fontSize: 13, padding: 8 }}>Aucun chauffeur.</div>}
        </div>

        <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{activeDriver ? activeDriver.name : "Sélectionnez un chauffeur"}</div>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.sender.role === "DISPATCH" ? "flex-end" : "flex-start",
                  maxWidth: "70%", padding: "8px 12px", borderRadius: 14, fontSize: 14,
                  background: m.sender.role === "DISPATCH" ? "var(--amber)" : "#1d2c46",
                  color: m.sender.role === "DISPATCH" ? "#1a1200" : "var(--text)",
                }}
              >
                {m.text}
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
    </div>
  );
}
