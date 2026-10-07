import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { api } from "../lib/api";

// Audit du 7 octobre 2026 (F07) : toute erreur (réseau, session expirée) devenait « 0,00 $ gagnés
// cette semaine », une information financière fausse. Une panne s'affiche maintenant comme telle,
// avec un bouton pour réessayer, et le dernier montant reçu reste visible avec son heure.
export default function EarningsScreen({ onBack }) {
  const [earnings, setEarnings] = useState(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);
  const [recuA, setRecuA] = useState(null);

  const charger = () => {
    setChargement(true);
    setErreur("");
    api.myEarnings()
      .then((e) => { setEarnings(e); setRecuA(new Date()); })
      .catch((e) => setErreur(e.message || "Revenus indisponibles pour le moment."))
      .finally(() => setChargement(false));
  };
  useEffect(() => { charger(); }, []);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <TouchableOpacity onPress={onBack} accessibilityRole="button"><Text style={{ color: "#8b99b5", marginBottom: 12 }}>← Retour</Text></TouchableOpacity>
      <Text style={styles.title} accessibilityRole="header">Mes revenus</Text>
      {erreur ? (
        <View style={[styles.card, { borderColor: "#e85d4c", marginBottom: 12 }]} accessibilityLiveRegion="polite">
          <Text style={{ color: "#e85d4c", marginBottom: 8 }}>Impossible d'afficher vos revenus : {erreur}</Text>
          <TouchableOpacity style={styles.bouton} onPress={charger} accessibilityRole="button">
            <Text style={styles.boutonTexte}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {chargement && !earnings ? (
        <ActivityIndicator color="#f5a623" />
      ) : earnings ? (
        <View style={styles.card}>
          <Text style={styles.label}>Total gagné cette semaine ({earnings.rideCount} course{earnings.rideCount === 1 ? "" : "s"})</Text>
          <Text style={styles.amount}>{Number(earnings.totalFare || 0).toFixed(2)} $</Text>
          <View style={styles.divider} />
          <Text style={styles.label}>Redevance Taxi Sylvain</Text>
          <Text style={[styles.amount, { color: "#f5a623", fontSize: 20 }]}>{Number(earnings.royaltyDue || 0).toFixed(2)} $</Text>
          {erreur && recuA ? <Text style={styles.ancien}>Montants reçus à {String(recuA.getHours()).padStart(2, "0")}:{String(recuA.getMinutes()).padStart(2, "0")}, peut-être plus à jour.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: "#edeff3", fontSize: 22, fontWeight: "700", marginBottom: 12 },
  card: { backgroundColor: "#16233a", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#28395a" },
  label: { color: "#8b99b5", fontSize: 12, marginBottom: 4 },
  amount: { color: "#edeff3", fontSize: 28, fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#28395a", marginVertical: 12 },
  ancien: { color: "#8b99b5", fontSize: 11, marginTop: 10 },
  bouton: { backgroundColor: "#f5a623", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  boutonTexte: { color: "#1a1200", fontWeight: "700" },
});
