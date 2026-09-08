import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { api } from "../lib/api";

export default function EarningsScreen({ onBack }) {
  const [earnings, setEarnings] = useState(null);

  useEffect(() => {
    api.myEarnings().then(setEarnings).catch(() => setEarnings({ totalFare: 0, royaltyDue: 0, rideCount: 0 }));
  }, []);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: "#8b99b5", marginBottom: 12 }}>← Retour</Text></TouchableOpacity>
      <Text style={styles.title}>Mes revenus</Text>
      {!earnings ? (
        <ActivityIndicator color="#f5a623" />
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>Total gagné cette semaine ({earnings.rideCount} course{earnings.rideCount === 1 ? "" : "s"})</Text>
          <Text style={styles.amount}>{earnings.totalFare.toFixed(2)} $</Text>
          <View style={styles.divider} />
          <Text style={styles.label}>Redevance Taxi Sylvain</Text>
          <Text style={[styles.amount, { color: "#f5a623", fontSize: 20 }]}>{earnings.royaltyDue.toFixed(2)} $</Text>
        </View>
      )}
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
