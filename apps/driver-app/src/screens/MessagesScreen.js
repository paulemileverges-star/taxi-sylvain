import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { playSound } from "../lib/sound";

export default function MessagesScreen({ user, onBack, rideContext, onRead }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef(null);

  // Fil ouvert = lu : on le signale au serveur à l'ouverture et à chaque message reçu (le badge
  // du menu se met à jour via onRead).
  const markRead = () => api.markThreadRead(`direct:${user.id}`).then(() => onRead?.()).catch(() => null);

  useEffect(() => {
    api.dispatchMessages(user.id).then(setMessages).then(markRead);
    let sock;
    getSocket().then((s) => {
      sock = s;
      s.on("message:direct", (m) => {
        if (m.driverId !== user.id) return;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        if (m.sender.role !== "DRIVER") markRead();
      });
    });
    return () => sock?.off("message:direct");
  }, [user.id]);

  const send = async () => {
    if (!draft.trim()) return;
    await api.sendDispatchMessage(user.id, draft, rideContext?.id);
    setDraft("");
    playSound("action");
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onBack}><Text style={styles.link}>← Retour</Text></TouchableOpacity>
        <Text style={styles.title}>Messagerie — Centrale</Text>
      </View>
      {rideContext && (
        <View style={styles.rideBanner}>
          <Text style={styles.rideBannerText}>Au sujet de la course : {rideContext.pickupAddress} → {rideContext.destAddress}</Text>
        </View>
      )}
      <ScrollView ref={scrollRef} style={{ flex: 1, paddingHorizontal: 16 }} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {messages.map((m) => (
          <View key={m.id}>
            <View
              style={[
                styles.bubble,
                m.sender.role === "DRIVER" ? styles.bubbleMine : styles.bubbleTheirs,
              ]}
            >
              <Text style={m.sender.role === "DRIVER" ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{m.text}</Text>
            </View>
            {m.ride && (
              <Text style={[styles.rideTag, m.sender.role === "DRIVER" ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
                À propos de : {m.ride.pickupAddress} → {m.ride.destAddress}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Écrire un message…"
          placeholderTextColor="#8b99b5"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={send}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send}>
          <Text style={{ color: "#1a1200", fontWeight: "700" }}>Envoyer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  link: { color: "#f5a623" },
  title: { color: "#edeff3", fontSize: 18, fontWeight: "700" },
  rideBanner: { backgroundColor: "#1d2c46", marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#28395a" },
  rideBannerText: { color: "#f5a623", fontSize: 12, fontWeight: "600" },
  rideTag: { color: "#8b99b5", fontSize: 10, marginBottom: 8, marginTop: -4 },
  bubble: { maxWidth: "75%", padding: 10, borderRadius: 14, marginBottom: 8 },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: "#f5a623" },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: "#1d2c46" },
  bubbleTextMine: { color: "#1a1200" },
  bubbleTextTheirs: { color: "#edeff3" },
  inputRow: { flexDirection: "row", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: "#28395a" },
  input: { flex: 1, backgroundColor: "#1d2c46", color: "#edeff3", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  sendBtn: { backgroundColor: "#f5a623", borderRadius: 20, paddingHorizontal: 16, justifyContent: "center" },
});
