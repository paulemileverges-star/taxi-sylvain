import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { api } from "../lib/api";
import { playSound } from "../lib/sound";
import { showAlert } from "../lib/alert";
import AddressInput from "../components/AddressInput";

export default function BookScreen({ user, onBooked, onOpenGroups, onOpenChangePassword, onOpenNotifications, onOpenRides, onLogout }) {
  const [pickup, setPickup] = useState({ address: "", lat: null, lng: null });
  const [dest, setDest] = useState({ address: "", lat: null, lng: null });
  const [flightNumber, setFlightNumber] = useState("");

  const book = async () => {
    if (!pickup.address.trim() || !dest.address.trim()) {
      showAlert("Adresses requises", "Merci d'indiquer la prise en charge et la destination.");
      return;
    }
    try {
      // fare estimée ici de façon simplifiée — à remplacer par un vrai calcul (distance x tarif/km)
      const ride = await api.bookRide({
        pickupAddress: pickup.address,
        pickupLat: pickup.lat ?? undefined,
        pickupLng: pickup.lng ?? undefined,
        destAddress: dest.address,
        destLat: dest.lat ?? undefined,
        destLng: dest.lng ?? undefined,
        fare: 20,
        flightNumber: flightNumber || undefined,
      });
      playSound("action");
      onBooked(ride.id);
    } catch (e) {
      showAlert("Erreur", e.message);
    }
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Bonjour {user?.name || ""}</Text>
        <TouchableOpacity onPress={onLogout}><Text style={styles.logoutLink}>Se déconnecter</Text></TouchableOpacity>
      </View>
      <View style={{ flexDirection: "row", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <TouchableOpacity onPress={onOpenRides}><Text style={styles.link}>Courses</Text></TouchableOpacity>
        <TouchableOpacity onPress={onOpenGroups}><Text style={styles.link}>Groupes</Text></TouchableOpacity>
        <TouchableOpacity onPress={onOpenChangePassword}><Text style={styles.link}>Mot de passe</Text></TouchableOpacity>
        <TouchableOpacity onPress={onOpenNotifications}><Text style={styles.link}>Notifications</Text></TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>Où allez-vous ?</Text>
      <AddressInput placeholder="Adresse de prise en charge" value={pickup.address} onChange={setPickup} />
      <AddressInput placeholder="Destination" value={dest.address} onChange={setDest} />
      <TextInput style={styles.input} placeholder="Numéro de vol (optionnel)" placeholderTextColor="#8b99b5" value={flightNumber} onChangeText={setFlightNumber} />
      <TouchableOpacity style={styles.primaryBtn} onPress={book}>
        <Text style={styles.primaryBtnText}>Réserver dans l'app</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.outlineBtn} onPress={() => Linking.openURL("tel:+14384991120")}>
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
