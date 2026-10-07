import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { getSocket } from "../lib/socket.js";
import { playSound } from "../lib/sound.js";

function conversationTitle(conv, meId) {
  if (conv.name) return conv.name;
  const others = conv.participants.filter((p) => p.id !== meId);
  return others.map((p) => p.name).join(", ") || "Groupe";
}

// Audit du 7 octobre 2026 : la liste des membres possibles n'exige plus les permissions Chauffeurs et
// Clients (F04 : sans elles, la page ne s'ouvrait pas) ; chaque groupe garde son propre brouillon, les
// messages sont vidés au changement de groupe et une réponse tardive d'un autre groupe est ignorée (F23).
export default function Groups({ user, unread = {}, onRead }) {
  const [conversations, setConversations] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [clients, setClients] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [brouillons, setBrouillons] = useState({});
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const me = user;
  const accesClients = user?.role === "DISPATCH" || Boolean(user?.permissions?.includes("clients"));
  const bottomRef = useRef(null);
  const groupeDemande = useRef(null);

  useEffect(() => {
    Promise.allSettled([api.listConversations(), api.listDriverChoices(), accesClients ? api.listClients() : Promise.resolve([])]).then(([convs, d, c]) => {
      if (convs.status === "fulfilled") {
        setConversations(convs.value);
        if (convs.value.length > 0) setActiveId(convs.value[0].id);
      } else setErreur(convs.reason?.message || "Groupes indisponibles.");
      if (d.status === "fulfilled") setDrivers(d.value);
      if (c.status === "fulfilled") setClients(c.value);
    });
  }, []);

  const markRead = (conversationId) => api.markThreadRead(`group:${conversationId}`).then(() => onRead?.()).catch(() => null);

  useEffect(() => {
    if (!activeId) return;
    groupeDemande.current = activeId;
    setMessages([]);
    api.listConversationMessages(activeId)
      .then((liste) => {
        if (groupeDemande.current !== activeId) return;
        setMessages(liste);
        markRead(activeId);
      })
      .catch((e) => { if (groupeDemande.current === activeId) setErreur(e.message || "Messages indisponibles."); });
  }, [activeId]);

  const draft = (activeId && brouillons[activeId]) || "";
  const setDraft = (texte) => setBrouillons((b) => ({ ...b, [activeId]: texte }));

  useEffect(() => {
    const socket = getSocket();
    const onGroup = ({ conversationId, message }) => {
      if (conversationId === activeId) {
        setMessages((prev) => (prev.some((x) => x.id === message.id) ? prev : [...prev, message]));
        if (message.sender.id !== me?.id) markRead(activeId);
      }
      api.listConversations().then(setConversations);
    };
    socket.on("message:group", onGroup);
    return () => socket.off("message:group", onGroup);
  }, [activeId, me?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const groupe = activeId;
    const texte = (brouillons[groupe] || "").trim();
    if (!texte || !groupe || envoi) return;
    setEnvoi(true);
    try {
      await api.sendConversationMessage(groupe, texte);
      setBrouillons((b) => ({ ...b, [groupe]: "" }));
      playSound("action");
    } catch (e) {
      window.alert(e.message || "Message non envoyé.");
    } finally {
      setEnvoi(false);
    }
  };

  const removeGroup = async (conversation) => {
    if (!window.confirm(`Supprimer le groupe « ${conversationTitle(conversation, me?.id)} » et tous ses messages ? Cette action est définitive.`)) return;
    try {
      await api.deleteConversation(conversation.id);
    } catch (e) {
      window.alert(e.message || "Suppression impossible.");
      return;
    }
    playSound("action");
    const remaining = conversations.filter((c) => c.id !== conversation.id);
    setConversations(remaining);
    setActiveId(remaining[0]?.id || null);
    setMessages([]);
    onRead?.();
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const createGroup = async () => {
    if (selectedIds.length === 0) return;
    let conv;
    try {
      conv = await api.createConversation({ name: newName || undefined, participantIds: selectedIds });
    } catch (e) {
      window.alert(e.message || "Création impossible.");
      return;
    }
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
        <div style={{ display: "flex", gap: 8 }}>
          {active && <button className="btn red" onClick={() => removeGroup(active)}>Supprimer ce groupe</button>}
          <button className="btn" onClick={() => setShowCreate(true)}>Nouveau groupe</button>
        </div>
      </div>
      {erreur && <div className="card" role="alert" style={{ color: "#e85d4c" }}>{erreur}</div>}
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontWeight: unread[c.id] ? 700 : 400 }}>
                <span>{conversationTitle(c, me?.id)}</span>
                {unread[c.id] ? <span className="unread-badge">{unread[c.id]}</span> : null}
              </div>
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
                  aria-label={`Message au groupe ${conversationTitle(active, me?.id)}`}
                  placeholder={`Écrire au groupe « ${conversationTitle(active, me?.id)} »…`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                />
                <button className="btn" onClick={send} disabled={envoi || !draft.trim()}>{envoi ? "Envoi…" : "Envoyer"}</button>
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
            {!accesClients && <div style={{ fontSize: 12, color: "var(--muted)" }}>La liste des clients demande la permission Clients.</div>}
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
