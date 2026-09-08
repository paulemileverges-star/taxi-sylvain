import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";

export default function ChatScreen({ rideId, onBack }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    api.rideMessages(rideId).then(setMessages);
    let sock;
    getSocket().then((s) => {
      sock = s;
      s.emit("ride:watch", rideId);
      s.on("message:new", (m) => {
        if (m.rideId === rideId) setMessages((prev) => [...prev, m]);
      });
    });
    return () => sock?.off("message:new");
  }, [rideId]);

  const send = async () => {
    if (!draft.trim()) return;
    await api.sendMessage(rideId, draft);
    setDraft("");
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onBack}><Text style={styles.link}>← Retour</Text></TouchableOpacity>
        <Text style={styles.title}>Message au chauffeur</Text>
      </View>
      <ScrollView ref={scrollRef} style={{ flex: 1, paddingHorizontal: 16 }} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {messages.map((m) => (
          <View
            key={m.id}
            style={[styles.bubble, m.sender.role === "CLIENT" ? styles.bubbleMine : styles.bubbleTheirs]}
          >
            <Text style={m.sender.role === "CLIENT" ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{m.text}</Text>
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
  bubble: { maxWidth: "75%", padding: 10, borderRadius: 14, marginBottom: 8 },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: "#f5a623" },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: "#1d2c46" },
  bubbleTextMine: { color: "#1a1200" },
  bubbleTextTheirs: { color: "#edeff3" },
  inputRow: { flexDirection: "row", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: "#28395a" },
  input: { flex: 1, backgroundColor: "#1d2c46", color: "#edeff3", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  sendBtn: { backgroundColor: "#f5a623", borderRadius: 20, paddingHorizontal: 16, justifyContent: "center" },
});
