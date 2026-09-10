import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { getSocket } from "../lib/socket.js";
import { playSound } from "../lib/sound.js";

function conversationTitle(conv, meId) {
  if (conv.name) return conv.name;
  const others = conv.participants.filter((p) => p.id !== meId);
  return others.map((p) => p.name).join(", ") || "Groupe";
}

export default function Groups() {
  const [conversations, setConversations] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [clients, setClients] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [me, setMe] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const raw = localStorage.getItem("ts_user");
    if (raw) setMe(JSON.parse(raw));
    Promise.all([api.listConversations(), api.listDrivers(), api.listClients()]).then(([convs, d, c]) => {
      setConversations(convs);
      setDrivers(d);
      setClients(c);
      if (convs.length > 0) setActiveId(convs[0].id);
    });
  }, []);

  useEffect(() => {
    if (!activeId) return;
    api.listConversationMessages(activeId).then(setMessages);
  }, [activeId]);

  useEffect(() => {
    const socket = getSocket();
    const onGroup = ({ conversationId, message }) => {
      if (conversationId === activeId) setMessages((prev) => [...prev, message]);
      api.listConversations().then(setConversations);
    };
    socket.on("message:group", onGroup);
    return () => socket.off("message:group", onGroup);
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!draft.trim() || !activeId) return;
    await api.sendConversationMessage(activeId, draft);
    setDraft("");
    playSound("action");
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const createGroup = async () => {
    if (selectedIds.length === 0) return;
    const conv = await api.createConversation({ name: newName || undefined, participantIds: selectedIds });
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setShowCreate(false);
    setNewName("");
    setSelectedIds([]);
    playSound("action");
  };

  const active = conversations.find((c) => c.id === activeId);

  return (
    <div>
      <div className="row">
        <h1>Groupes de discussion</h1>
        <button className="btn" onClick={() => setShowCreate(true)}>Nouveau groupe</button>
      </div>
      <div className="messages-layout">
        <div className="card messages-driverlist" style={{ padding: 8, overflowY: "auto" }}>
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "10px 12px",
                background: activeId === c.id ? "rgba(245,166,35,0.1)" : "transparent",
                border: "none", borderRadius: 8, color: "var(--text)", cursor: "pointer", marginBottom: 4,
              }}
            >
              <div>{conversationTitle(c, me?.id)}</div>
              <div style={{ fontSize: 11, color: "#8b99b5" }}>{c.participants.length} participant(s)</div>
            </button>
          ))}
          {conversations.length === 0 && <div style={{ color: "#8b99b5", fontSize: 13, padding: 8 }}>Aucun groupe pour l'instant.</div>}
        </div>

        <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", padding: 12 }}>
          {active ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{conversationTitle(active, me?.id)}</div>
              <div style={{ fontSize: 12, color: "#8b99b5", marginBottom: 8 }}>
                {active.participants.map((p) => p.name).join(", ")}
              </div>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {messages.map((m) => (
                  <div key={m.id} style={{ alignSelf: m.sender.id === me?.id ? "flex-end" : "flex-start", maxWidth: "75%" }}>
                    <div style={{ fontSize: 11, color: "#8b99b5", marginBottom: 2, textAlign: m.sender.id === me?.id ? "right" : "left" }}>
                      {m.sender.name}
                    </div>
                    <div
                      style={{
                        padding: "8px 12px", borderRadius: 14, fontSize: 14,
                        background: m.sender.id === me?.id ? "var(--amber)" : "#1d2c46",
                        color: m.sender.id === me?.id ? "#1a1200" : "var(--text)",
                      }}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input
                  className="input" style={{ marginTop: 0 }}
                  placeholder="Écrire un message au groupe…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                />
                <button className="btn" onClick={send}>Envoyer</button>
              </div>
            </>
          ) : (
            <div style={{ color: "#8b99b5" }}>Crée un groupe ou sélectionnes-en un pour commencer.</div>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxHeight: "80vh", overflowY: "auto" }}>
            <div className="row"><h3>Nouveau groupe</h3><button onClick={() => setShowCreate(false)}>✕</button></div>
            <label>Nom du groupe (optionnel)</label>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ex. Chauffeurs de nuit" />

            <div style={{ marginTop: 12, fontSize: 12, color: "#8b99b5", textTransform: "uppercase" }}>Chauffeurs</div>
            {drivers.map((d) => (
              <label key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
                <input type="checkbox" checked={selectedIds.includes(d.id)} onChange={() => toggleSelected(d.id)} />
                {d.name}
              </label>
            ))}

            <div style={{ marginTop: 12, fontSize: 12, color: "#8b99b5", textTransform: "uppercase" }}>Clients</div>
            {clients.map((c) => (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
                <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleSelected(c.id)} />
                {c.name}
              </label>
            ))}

            <button
              className="btn" style={{ marginTop: 14, width: "100%" }}
              disabled={selectedIds.length === 0}
              onClick={createGroup}
            >
              Créer le groupe ({selectedIds.length} sélectionné{selectedIds.length > 1 ? "s" : ""})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
