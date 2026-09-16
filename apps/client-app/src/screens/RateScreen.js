import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from "react-native";
import { api, assetUrl } from "../lib/api";
import { playSound } from "../lib/sound";
import { showAlert } from "../lib/alert";

export default function RateScreen({ rideId, onDone }) {
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [driver, setDriver] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.myRides().then((rides) => {
      const ride = rides.find((r) => r.id === rideId);
      setDriver(ride?.driver || null);
    });
  }, [rideId]);

  const submit = async () => {
    if (!driver?.id) {
      showAlert("Erreur", "Impossible de retrouver le chauffeur de cette course.");
      onDone();
      return;
    }
    setSubmitting(true);
    try {
      await api.rate(rideId, driver.id, stars, comment);
      playSound("action");
    } catch (e) {
      showAlert("Erreur", e.message);
    } finally {
      onDone();
    }
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={styles.title}>Merci ! Notez {driver ? driver.name : "votre chauffeur"}</Text>
      {!driver ? (
        <ActivityIndicator color="#f5a623" />
      ) : (
        <>
          <View style={styles.driverRow}>
            <View style={styles.avatar}>
              {driver.photoUrl ? <Image source={{ uri: assetUrl(driver.photoUrl) }} style={styles.avatarImg} /> : <Text style={styles.avatarInitial}>{driver.name?.[0]}</Text>}
            </View>
            {driver.carPhotoUrl ? <Image source={{ uri: assetUrl(driver.carPhotoUrl) }} style={styles.carThumb} /> : null}
            <Text style={styles.driverInfo}>{driver.carModel || ""}{driver.plate ? ` · ${driver.plate}` : ""}</Text>
          </View>
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
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: "#edeff3", fontSize: 20, fontWeight: "700", marginBottom: 16 },
  driverRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#1d2c46", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitial: { color: "#edeff3", fontWeight: "700", fontSize: 18 },
  carThumb: { width: 64, height: 44, borderRadius: 8 },
  driverInfo: { color: "#8b99b5", flexShrink: 1 },
  stars: { flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 16 },
  input: { backgroundColor: "#16233a", color: "#edeff3", borderRadius: 12, padding: 12, minHeight: 80, borderWidth: 1, borderColor: "#28395a", marginBottom: 12 },
  primaryBtn: { backgroundColor: "#f5a623", borderRadius: 12, padding: 14, alignItems: "center" },
  primaryBtnText: { color: "#1a1200", fontWeight: "700" },
});
