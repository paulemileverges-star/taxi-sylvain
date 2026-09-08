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

export default function GroupsScreen({ user, onBack }) {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    api.listConversations().then(setConversations);
  }, []);

  useEffect(() => {
    if (!active) return;
    api.conversationMessages(active.id).then(setMessages);
    let sock;
    getSocket().then((s) => {
      sock = s;
      s.on("message:group", ({ conversationId, message }) => {
        if (conversationId !== active.id) return;
        setMessages((prev) => [...prev, message]);
        if (message.sender.id !== user.id) playSound("notify");
      });
    });
    return () => sock?.off("message:group");
  }, [active?.id]);

  const send = async () => {
    if (!draft.trim() || !active) return;
    await api.sendConversationMessage(active.id, draft);
    setDraft("");
    playSound("action");
  };

  if (active) {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => setActive(null)}><Text style={styles.link}>← Retour</Text></TouchableOpacity>
          <Text style={styles.title}>{conversationTitle(active, user.id)}</Text>
        </View>
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
          <TouchableOpacity style={styles.sendBtn} onPress={send}>
            <Text style={{ color: "#1a1200", fontWeight: "700" }}>Envoyer</Text>
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
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.groupCard} onPress={() => setActive(item)}>
            <Text style={styles.groupTitle}>{conversationTitle(item, user.id)}</Text>
            <Text style={styles.groupSub}>{item.participants.length} participant(s)</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={{ color: "#8b99b5" }}>Aucun groupe pour le moment.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  link: { color: "#f5a623" },
  title: { color: "#edeff3", fontSize: 18, fontWeight: "700" },
  groupCard: { backgroundColor: "#16233a", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#28395a" },
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
});
