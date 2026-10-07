import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, FlatList, StyleSheet } from "react-native";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { playSound } from "../lib/sound";

function conversationTitle(conv, meId) {
  if (conv.name) return conv.name;
  const others = conv.participants.filter((p) => p.id !== meId);
  return others.map((p) => p.name).join(", ") || "Groupe";
}

// Audit du 7 octobre 2026 :
//   - F02 : en quittant un groupe, « off("message:group") » sans fonction retirait AUSSI l'écouteur
//     global de l'application (son, badge) : plus aucune alerte de groupe ensuite. Seul l'écouteur de
//     cet écran est retiré désormais ;
//   - F23 : messages vidés au changement de groupe, réponse tardive d'un autre groupe ignorée, un
//     brouillon par groupe ;
//   - F08 : une panne s'affiche au lieu d'une liste vide, un envoi raté le dit.
export default function GroupsScreen({ user, onBack, unread = {}, onRead }) {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [brouillons, setBrouillons] = useState({});
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const scrollRef = useRef(null);
  const groupeDemande = useRef(null);

  const charger = () => {
    setErreur("");
    api.listConversations().then(setConversations).catch((e) => setErreur(e.message || "Groupes indisponibles."));
  };
  useEffect(() => { charger(); }, []);

  useEffect(() => {
    if (!active) return undefined;
    const id = active.id;
    groupeDemande.current = id;
    setMessages([]);
    const markRead = () => api.markThreadRead(`group:${id}`).then(() => onRead?.()).catch(() => null);
    api.conversationMessages(id)
      .then((liste) => {
        if (groupeDemande.current !== id) return;
        setMessages(liste);
        markRead();
      })
      .catch((e) => { if (groupeDemande.current === id) setErreur(e.message || "Messages indisponibles."); });
    let sock;
    let annule = false;
    const surMessage = ({ conversationId, message }) => {
      if (conversationId !== id) return;
      setMessages((prev) => (prev.some((x) => x.id === message.id) ? prev : [...prev, message]));
      if (message.sender.id !== user.id) markRead();
    };
    getSocket().then((s) => {
      if (annule) return;
      sock = s;
      s.on("message:group", surMessage);
    });
    return () => {
      annule = true;
      sock?.off("message:group", surMessage);
    };
  }, [active?.id]);

  const draft = (active && brouillons[active.id]) || "";
  const setDraft = (texte) => active && setBrouillons((b) => ({ ...b, [active.id]: texte }));

  const send = async () => {
    const groupe = active?.id;
    const texte = (brouillons[groupe] || "").trim();
    if (!texte || !groupe || envoi) return;
    setEnvoi(true);
    try {
      await api.sendConversationMessage(groupe, texte);
      setBrouillons((b) => ({ ...b, [groupe]: "" }));
      playSound("action");
    } catch (e) {
      setErreur(e.message || "Message non envoyé.");
    } finally {
      setEnvoi(false);
    }
  };

  if (active) {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => setActive(null)}><Text style={styles.link}>← Retour</Text></TouchableOpacity>
          <Text style={styles.title}>{conversationTitle(active, user.id)}</Text>
        </View>
        {erreur ? <Text style={styles.erreur} accessibilityLiveRegion="polite">{erreur}</Text> : null}
        <ScrollView ref={scrollRef} style={{ flex: 1, paddingHorizontal: 16 }} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {messages.map((m) => (
            <View key={m.id} style={{ alignSelf: m.sender.id === user.id ? "flex-end" : "flex-start", maxWidth: "80%", marginBottom: 8 }}>
              <Text style={[styles.senderName, { textAlign: m.sender.id === user.id ? "right" : "left" }]}>{m.sender.name}</Text>
              <View style={[styles.bubble, m.sender.id === user.id ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={m.sender.id === user.id ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{m.text}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Écrire au groupe…"
            placeholderTextColor="#8b99b5"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
          />
          <TouchableOpacity style={[styles.sendBtn, envoi && { opacity: 0.6 }]} onPress={send} disabled={envoi} accessibilityRole="button" accessibilityLabel="Envoyer au groupe">
            <Text style={{ color: "#1a1200", fontWeight: "700" }}>{envoi ? "Envoi…" : "Envoyer"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onBack}><Text style={styles.link}>← Retour</Text></TouchableOpacity>
        <Text style={styles.title}>Groupes</Text>
      </View>
      {erreur ? (
        <TouchableOpacity onPress={charger}><Text style={styles.erreur}>{erreur} Touchez pour réessayer.</Text></TouchableOpacity>
      ) : null}
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.groupCard, unread[item.id] ? styles.groupCardUnread : null]} onPress={() => setActive(item)}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.groupTitle}>{conversationTitle(item, user.id)}</Text>
              {unread[item.id] ? <View style={styles.badge}><Text style={styles.badgeText}>{unread[item.id]}</Text></View> : null}
            </View>
            <Text style={styles.groupSub}>{item.participants.length} participant(s){unread[item.id] ? ` · ${unread[item.id]} nouveau${unread[item.id] > 1 ? "x" : ""} message${unread[item.id] > 1 ? "s" : ""}` : ""}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={erreur ? null : <Text style={{ color: "#8b99b5" }}>Aucun groupe pour le moment.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  link: { color: "#f5a623" },
  title: { color: "#edeff3", fontSize: 18, fontWeight: "700" },
  groupCard: { backgroundColor: "#16233a", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#28395a" },
  groupCardUnread: { borderColor: "#f5a623" },
  badge: { backgroundColor: "#e85d4c", borderRadius: 999, minWidth: 20, height: 20, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  groupTitle: { color: "#edeff3", fontWeight: "700" },
  groupSub: { color: "#8b99b5", fontSize: 12, marginTop: 4 },
  senderName: { color: "#8b99b5", fontSize: 11, marginBottom: 2 },
  bubble: { padding: 10, borderRadius: 14 },
  bubbleMine: { backgroundColor: "#f5a623" },
  bubbleTheirs: { backgroundColor: "#1d2c46" },
  bubbleTextMine: { color: "#1a1200" },
  bubbleTextTheirs: { color: "#edeff3" },
  inputRow: { flexDirection: "row", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: "#28395a" },
  input: { flex: 1, backgroundColor: "#1d2c46", color: "#edeff3", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  sendBtn: { backgroundColor: "#f5a623", borderRadius: 20, paddingHorizontal: 16, justifyContent: "center" },
  erreur: { color: "#e85d4c", fontSize: 13, paddingHorizontal: 16, marginBottom: 8 },
});
