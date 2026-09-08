import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Linking } from "react-native";
import { api } from "../lib/api";
import { playSound } from "../lib/sound";

export default function BookScreen({ onBooked }) {
  const [pickupAddress, setPickup] = useState("");
  const [destAddress, setDest] = useState("");

  const book = async () => {
    if (!pickupAddress.trim() || !destAddress.trim()) {
      Alert.alert("Adresses requises", "Merci d'indiquer la prise en charge et la destination.");
      return;
    }
    try {
      // fare estimée ici de façon simplifiée — à remplacer par un vrai calcul (distance x tarif/km)
      const ride = await api.bookRide({ pickupAddress, destAddress, fare: 20 });
      playSound("action");
      onBooked(ride.id);
    } catch (e) {
      Alert.alert("Erreur", e.message);
    }
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={styles.title}>Où allez-vous ?</Text>
      <TextInput style={styles.input} placeholder="Adresse de prise en charge" placeholderTextColor="#8b99b5" value={pickupAddress} onChangeText={setPickup} />
      <TextInput style={styles.input} placeholder="Destination" placeholderTextColor="#8b99b5" value={destAddress} onChangeText={setDest} />
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
  title: { color: "#edeff3", fontSize: 24, fontWeight: "700", marginBottom: 16 },
  input: { backgroundColor: "#16233a", color: "#edeff3", borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#28395a" },
  primaryBtn: { backgroundColor: "#f5a623", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 10 },
  primaryBtnText: { color: "#1a1200", fontWeight: "700" },
  outlineBtn: { borderWidth: 1, borderColor: "#28395a", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 8 },
});
