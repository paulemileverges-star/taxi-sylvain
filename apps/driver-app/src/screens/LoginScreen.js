import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../lib/api";

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    try {
      const data = await api.login(email, password);
      await AsyncStorage.setItem("ts_token", data.token);
      await AsyncStorage.setItem("ts_user", JSON.stringify(data.user));
      onLogin(data.user);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Taxi Sylvain — Chauffeur</Text>
      <TextInput style={styles.input} placeholder="Courriel" placeholderTextColor="#8b99b5" value={email} onChangeText={setEmail} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Mot de passe" placeholderTextColor="#8b99b5" value={password} onChangeText={setPassword} secureTextEntry />
      {!!error && <Text style={{ color: "#e85d4c", marginBottom: 8 }}>{error}</Text>}
      <TouchableOpacity style={styles.btn} onPress={submit}><Text style={styles.btnText}>Se connecter</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  title: { color: "#f5a623", fontSize: 24, fontWeight: "700", marginBottom: 20 },
  input: { backgroundColor: "#1d2c46", color: "#edeff3", borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#28395a" },
  btn: { backgroundColor: "#f5a623", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 },
  btnText: { color: "#1a1200", fontWeight: "700" },
});
