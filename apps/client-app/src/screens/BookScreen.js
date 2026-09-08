import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Linking } from "react-native";
import { api } from "../lib/api";
import { playSound } from "../lib/sound";

export default function BookScreen({ user, onBooked, onOpenGroups, onOpenChangePassword, onLogout }) {
  const [pickupAddress, setPickup] = useState("");
  const [destAddress, setDest] = useState("");
  const [flightNumber, setFlightNumber] = useState("");

  const book = async () => {
    if (!pickupAddress.trim() || !destAddress.trim()) {
      Alert.alert("Adresses requises", "Merci d'indiquer la prise en charge et la destination.");
      return;
    }
    try {
      // fare estimée ici de façon simplifiée — à remplacer par un vrai calcul (distance x tarif/km)
      const ride = await api.bookRide({ pickupAddress, destAddress, fare: 20, flightNumber: flightNumber || undefined });
      playSound("action");
      onBooked(ride.id);
    } catch (e) {
      Alert.alert("Erreur", e.message);
    }
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Bonjour {user?.name || ""}</Text>
        <TouchableOpacity onPress={onLogout}><Text style={styles.logoutLink}>Se déconnecter</Text></TouchableOpacity>
      </View>
      <View style={{ flexDirection: "row", gap: 16, marginBottom: 16 }}>
        <TouchableOpacity onPress={onOpenGroups}><Text style={styles.link}>Groupes</Text></TouchableOpacity>
        <TouchableOpacity onPress={onOpenChangePassword}><Text style={styles.link}>Mot de passe</Text></TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>Où allez-vous ?</Text>
      <TextInput style={styles.input} placeholder="Adresse de prise en charge" placeholderTextColor="#8b99b5" value={pickupAddress} onChangeText={setPickup} />
      <TextInput style={styles.input} placeholder="Destination" placeholderTextColor="#8b99b5" value={destAddress} onChangeText={setDest} />
      <TextInput style={styles.input} placeholder="Numéro de vol (optionnel)" placeholderTextColor="#8b99b5" value={flightNumber} onChangeText={setFlightNumber} />
      <TouchableOpacity style={styles.primaryBtn} onPress={book}>
        <Text style={styles.primaryBtnText}>Réserver dans l'app</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.outlineBtn} onPress={() => Linking.openURL("tel:+15145550100")}>
        <Text style={{ color: "#edeff3" }}>Réserver par téléphone</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { color: "#edeff3", fontSize: 22, fontWeight: "700" },
  logoutLink: { color: "#e85d4c", fontWeight: "600" },
  link: { color: "#f5a623" },
  subtitle: { color: "#edeff3", fontSize: 18, fontWeight: "700", marginBottom: 16 },
  input: { backgroundColor: "#16233a", color: "#edeff3", borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#28395a" },
  primaryBtn: { backgroundColor: "#f5a623", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 10 },
  primaryBtnText: { color: "#1a1200", fontWeight: "700" },
  outlineBtn: { borderWidth: 1, borderColor: "#28395a", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 8 },
});
