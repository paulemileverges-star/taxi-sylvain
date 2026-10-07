import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { api } from "../lib/api";
import { DriverAvatar, CarPhoto } from "../components/DriverPhotos";
import { playSound } from "../lib/sound";

// Audit du 7 octobre 2026 (F06) : cet écran s'ouvre tout seul à la fin d'une course, mais n'avait
// AUCUN bouton pour en sortir ; si le chauffeur ne se chargeait pas (panne, compte supprimé), le
// client restait bloqué sur un indicateur d'attente. La notation reste facultative : « Plus tard »
// est toujours là, une panne s'affiche avec « Réessayer », et un envoi raté garde la saisie.
export default function RateScreen({ rideId, onDone }) {
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [driver, setDriver] = useState(null);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const charger = () => {
    setErreur("");
    setCharge(false);
    api.ride(rideId)
      .then((ride) => {
        setDriver(ride?.driver || null);
        setCharge(true);
        if (!ride?.driver) setErreur("Le chauffeur de cette course n'est plus disponible : il n'y a rien à noter.");
      })
      .catch((e) => setErreur(e.message || "Course introuvable."));
  };
  useEffect(() => { charger(); }, [rideId]);

  const submit = async () => {
    if (!driver?.id) {
      onDone();
      return;
    }
    setSubmitting(true);
    setErreur("");
    try {
      await api.rate(rideId, driver.id, stars, comment);
      playSound("action");
      onDone();
    } catch (e) {
      if (e.status === 409) onDone(); // déjà notée : rien à refaire
      else setErreur(`Note non envoyée : ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={styles.title} accessibilityRole="header">Merci ! Notez {driver ? driver.name : "votre chauffeur"}</Text>
      {erreur ? (
        <View style={styles.erreurBloc} accessibilityLiveRegion="polite">
          <Text style={styles.erreur}>{erreur}</Text>
          {!charge ? (
            <TouchableOpacity onPress={charger} accessibilityRole="button"><Text style={styles.reessayer}>Réessayer</Text></TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {!charge && !erreur ? <ActivityIndicator color="#f5a623" /> : null}
      {driver ? (
        <>
          <View style={styles.driverRow}>
            <DriverAvatar driver={driver} size={48} />
            <CarPhoto driver={driver} height={44} style={{ width: 64 }} />
            <Text style={styles.driverInfo}>{[driver.carModel, driver.plate].filter(Boolean).join(" · ")}</Text>
          </View>
          <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel={`Note : ${stars} sur 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setStars(n)} accessibilityRole="button" accessibilityLabel={`${n} étoile${n > 1 ? "s" : ""}`} accessibilityState={{ selected: n <= stars }}>
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
            accessibilityLabel="Avis sur le chauffeur (optionnel)"
            multiline
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={submit} disabled={submitting} accessibilityRole="button">
            <Text style={styles.primaryBtnText}>{submitting ? "Envoi…" : "Envoyer"}</Text>
          </TouchableOpacity>
        </>
      ) : null}
      {/* Toujours accessible : la notation est facultative. */}
      <TouchableOpacity style={styles.skipBtn} onPress={onDone} accessibilityRole="button">
        <Text style={styles.skipBtnText}>Plus tard</Text>
      </TouchableOpacity>
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
  skipBtn: { padding: 12, alignItems: "center", marginTop: 6 },
  skipBtnText: { color: "#8b99b5" },
  erreurBloc: { backgroundColor: "#2a1616", borderRadius: 10, padding: 12, marginBottom: 12 },
  erreur: { color: "#e85d4c" },
  reessayer: { color: "#f5a623", marginTop: 8, fontWeight: "700" },
});
