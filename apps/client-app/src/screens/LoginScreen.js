import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../lib/api";
import { requestWebNotificationPermission } from "../lib/webNotify";

export default function LoginScreen({ onLogin, onCreerCompte, onVerification }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    // Version web : la permission de notification se demande dans le geste du bouton, sinon le
    // navigateur ignore la demande.
    requestWebNotificationPermission();
    try {
      const data = await api.login(email, password);
      await AsyncStorage.setItem("ts_token", data.token);
      await AsyncStorage.setItem("ts_user", JSON.stringify(data.user));
      onLogin(data.user);
    } catch (e) {
      // Nouveau compte : le serveur vient d’envoyer un code de confirmation par courriel.
      if (e.data?.verificationRequired) return onVerification?.({ email: e.data.email || email.trim(), password, message: e.message });
      setError(e.message);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require("../../assets/icon.png")} style={styles.logo} />
      <Text style={styles.title}>Taxi Sylvain</Text>
      <TextInput style={styles.input} placeholder="Courriel" placeholderTextColor="#8b99b5" value={email} onChangeText={setEmail} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Mot de passe" placeholderTextColor="#8b99b5" value={password} onChangeText={setPassword} secureTextEntry />
      {!!error && <Text style={{ color: "#e85d4c", marginBottom: 8 }}>{error}</Text>}
      <TouchableOpacity style={styles.btn} onPress={submit}><Text style={styles.btnText}>Se connecter</Text></TouchableOpacity>

      {/* Sans cette porte, un nouveau client n'avait aucun moyen d'ouvrir un compte lui-même. */}
      <TouchableOpacity style={styles.btnSecond} onPress={onCreerCompte}>
        <Text style={styles.btnSecondText}>Créer mon compte</Text>
      </TouchableOpacity>
      <Text style={styles.aide}>Première course ? Créez votre compte, ou appelez le 438-499-1120.</Text>
      {/* Mention demandée par le propriétaire le 21 septembre 2026, aussi présente sur le site et les pages légales. */}
      <Text style={styles.signature}>Yves Christopher, Directeur Technique, Taxi Sylvain</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  logo: { width: 96, height: 96, borderRadius: 48, alignSelf: "center", marginBottom: 16 },
  title: { color: "#f5a623", fontSize: 24, fontWeight: "700", marginBottom: 20, textAlign: "center" },
  input: { backgroundColor: "#1d2c46", color: "#edeff3", borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#28395a" },
  btn: { backgroundColor: "#f5a623", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 },
  btnText: { color: "#1a1200", fontWeight: "700" },
  btnSecond: { borderRadius: 10, padding: 14, alignItems: "center", marginTop: 10, borderWidth: 1, borderColor: "#f5a623" },
  btnSecondText: { color: "#f5a623", fontWeight: "700" },
  aide: { color: "#8b99b5", fontSize: 12, textAlign: "center", marginTop: 14, lineHeight: 17 },
  signature: { color: "#8b99b5", fontSize: 11, textAlign: "center", marginTop: 18 },
});
