import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { api } from "../lib/api";
import { playSound } from "../lib/sound";

// Audit du 7 octobre 2026 (F06) : « Passer » n'apparaissait qu'après un chargement réussi (une panne
// enfermait le chauffeur sur cet écran), et un envoi raté quittait l'écran en perdant la note. La
// notation reste facultative : on peut toujours passer, et un échec garde la saisie pour réessayer.
export default function RatingScreen({ rideId, onDone }) {
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [client, setClient] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [erreur, setErreur] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const charger = () => {
    setErreur("");
    setLoaded(false);
    // Seule la course concernée est lue (F20 : la liste complète était chargée pour en trouver une).
    api.ride(rideId)
      .then((ride) => { setClient(ride?.client || null); setLoaded(true); })
      .catch((e) => setErreur(e.message || "Course introuvable."));
  };
  useEffect(() => { charger(); }, [rideId]);

  const submit = async () => {
    if (!client?.id) {
      // Réservation par téléphone sans compte client — rien à noter, on passe simplement à la suite.
      onDone();
      return;
    }
    setSubmitting(true);
    setErreur("");
    try {
      await api.rate(rideId, client.id, stars, comment);
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
      <Text style={styles.title} accessibilityRole="header">Course terminée ! Notez {client ? client.name : "le client"}</Text>
      {erreur ? (
        <View style={styles.erreurBloc} accessibilityLiveRegion="polite">
          <Text style={styles.erreur}>{erreur}</Text>
          {!loaded ? (
            <TouchableOpacity onPress={charger} accessibilityRole="button"><Text style={styles.reessayer}>Réessayer</Text></TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {!loaded && !erreur ? <ActivityIndicator color="#f5a623" /> : null}
      {loaded ? (
        <>
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
            accessibilityLabel="Avis sur le client (optionnel)"
            multiline
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={submit} disabled={submitting} accessibilityRole="button">
            <Text style={styles.primaryBtnText}>{submitting ? "Envoi…" : "Envoyer"}</Text>
          </TouchableOpacity>
        </>
      ) : null}
      {/* Toujours accessible, même pendant le chargement ou après une panne. */}
      <TouchableOpacity style={styles.skipBtn} onPress={onDone} accessibilityRole="button">
        <Text style={styles.skipBtnText}>Passer</Text>
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
  skipBtn: { padding: 12, alignItems: "center", marginTop: 6 },
  skipBtnText: { color: "#8b99b5" },
  erreurBloc: { backgroundColor: "#2a1616", borderRadius: 10, padding: 12, marginBottom: 12 },
  erreur: { color: "#e85d4c" },
  reessayer: { color: "#f5a623", marginTop: 8, fontWeight: "700" },
});
