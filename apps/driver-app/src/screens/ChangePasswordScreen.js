import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { api } from "../lib/api";
import { ecrireJeton } from "../lib/session";
import { playSound } from "../lib/sound";
import { showAlert } from "../lib/alert";

export default function ChangePasswordScreen({ onBack }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const submit = async () => {
    if (newPassword !== confirm) {
      showAlert("Erreur", "Les deux nouveaux mots de passe ne correspondent pas.");
      return;
    }
    try {
      // Le serveur ferme toutes les autres sessions et renvoie un jeton neuf pour cet appareil
      // (audit du 7 octobre 2026, SEC-07) ; la connexion temps réel se reconnecte avec lui.
      const r = await api.changePassword(currentPassword, newPassword);
      if (r?.token) await ecrireJeton(r.token);
      playSound("action");
      showAlert("Succès", "Mot de passe mis à jour. Vos autres appareils devront se reconnecter.", [{ text: "OK", onPress: onBack }]);
    } catch (e) {
      showAlert("Erreur", e.message);
    }
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: "#8b99b5", marginBottom: 12 }}>← Retour</Text></TouchableOpacity>
      <Text style={styles.title}>Changer le mot de passe</Text>
      <TextInput style={styles.input} placeholder="Mot de passe actuel" placeholderTextColor="#8b99b5" secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />
      <TextInput style={styles.input} placeholder="Nouveau mot de passe" placeholderTextColor="#8b99b5" secureTextEntry value={newPassword} onChangeText={setNewPassword} />
      <TextInput style={styles.input} placeholder="Confirmer le nouveau mot de passe" placeholderTextColor="#8b99b5" secureTextEntry value={confirm} onChangeText={setConfirm} />
      <TouchableOpacity style={styles.primaryBtn} onPress={submit}>
        <Text style={styles.primaryBtnText}>Mettre à jour</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: "#edeff3", fontSize: 22, fontWeight: "700", marginBottom: 16 },
  input: { backgroundColor: "#16233a", color: "#edeff3", borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#28395a" },
  primaryBtn: { backgroundColor: "#f5a623", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 10 },
  primaryBtnText: { color: "#1a1200", fontWeight: "700" },
});
