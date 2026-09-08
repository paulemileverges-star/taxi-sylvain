import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

// NOTE : ceci affiche des données d'exemple. À brancher sur une route dédiée
// GET /api/reports/weekly?driverId=moi (déjà présente côté backend, filtrée par chauffeur à ajouter).
export default function EarningsScreen({ onBack }) {
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: "#8b99b5", marginBottom: 12 }}>← Retour</Text></TouchableOpacity>
      <Text style={styles.title}>Mes revenus</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Total gagné cette semaine</Text>
        <Text style={styles.amount}>1 240,00 $</Text>
        <View style={styles.divider} />
        <Text style={styles.label}>Redevance Taxi Sylvain (10 %)</Text>
        <Text style={[styles.amount, { color: "#f5a623", fontSize: 20 }]}>124,00 $</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: "#edeff3", fontSize: 22, fontWeight: "700", marginBottom: 12 },
  card: { backgroundColor: "#16233a", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#28395a" },
  label: { color: "#8b99b5", fontSize: 12, marginBottom: 4 },
  amount: { color: "#edeff3", fontSize: 28, fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#28395a", marginVertical: 12 },
});
