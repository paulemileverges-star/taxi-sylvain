import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { api } from "../lib/api";
import { playSound } from "../lib/sound";

export default function RateScreen({ rideId, onDone }) {
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");

  const submit = async () => {
    try {
      // toUserId (le chauffeur) doit être récupéré depuis la course — simplifié ici
      await api.rate(rideId, "DRIVER_ID_TO_FILL", stars, comment);
    } finally {
      playSound("action");
      onDone();
    }
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={styles.title}>Merci ! Notez votre chauffeur</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity key={n} onPress={() => setStars(n)}>
            <Text style={{ fontSize: 28, color: n <= stars ? "#f5a623" : "#28395a" }}>★</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.input}
        placeholder="Laisser un avis (optionnel)…"
        placeholderTextColor="#8b99b5"
        value={comment}
        onChangeText={setComment}
        multiline
      />
      <TouchableOpacity style={styles.primaryBtn} onPress={submit}>
        <Text style={styles.primaryBtnText}>Envoyer</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: "#edeff3", fontSize: 20, fontWeight: "700", marginBottom: 16 },
  stars: { flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 16 },
  input: { backgroundColor: "#16233a", color: "#edeff3", borderRadius: 12, padding: 12, minHeight: 80, borderWidth: 1, borderColor: "#28395a", marginBottom: 12 },
  primaryBtn: { backgroundColor: "#f5a623", borderRadius: 12, padding: 14, alignItems: "center" },
  primaryBtnText: { color: "#1a1200", fontWeight: "700" },
});
