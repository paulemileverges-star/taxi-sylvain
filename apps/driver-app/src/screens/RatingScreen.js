import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { api } from "../lib/api";
import { playSound } from "../lib/sound";
import { showAlert } from "../lib/alert";

export default function RatingScreen({ rideId, onDone }) {
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [client, setClient] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.myRides().then((rides) => {
      const ride = rides.find((r) => r.id === rideId);
      setClient(ride?.client || null);
      setLoaded(true);
    });
  }, [rideId]);

  const submit = async () => {
    if (!client?.id) {
      // Réservation par téléphone sans compte client — rien à noter, on passe simplement à la suite.
      onDone();
      return;
    }
    setSubmitting(true);
    try {
      await api.rate(rideId, client.id, stars, comment);
      playSound("action");
    } catch (e) {
      showAlert("Erreur", e.message);
    } finally {
      onDone();
    }
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={styles.title}>Course terminée ! Notez {client ? client.name : "le client"}</Text>
      {!loaded ? (
        <ActivityIndicator color="#f5a623" />
      ) : (
        <>
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
          <TouchableOpacity style={styles.primaryBtn} onPress={submit} disabled={submitting}>
            <Text style={styles.primaryBtnText}>{submitting ? "Envoi…" : "Envoyer"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={onDone}>
            <Text style={styles.skipBtnText}>Passer</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: "#edeff3", fontSize: 20, fontWeight: "700", marginBottom: 16 },
  stars: { flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 16 },
  input: { backgroundColor: "#16233a", color: "#edeff3", borderRadius: 12, padding: 12, minHeight: 80, borderWidth: 1, borderColor: "#28395a", marginBottom: 12 },
  primaryBtn: { backgroundColor: "#f5a623", borderRadius: 12, padding: 14, alignItems: "center" },
  primaryBtnText: { color: "#1a1200", fontWeight: "700" },
  skipBtn: { padding: 12, alignItems: "center", marginTop: 6 },
  skipBtnText: { color: "#8b99b5" },
});
