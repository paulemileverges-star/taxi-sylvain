import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../lib/api";

// Saisie du code à six chiffres reçu par courriel. Demande du propriétaire du 20 septembre 2026 :
// les nouveaux comptes (inscription dans l'app, ou compte créé par Taxi Sylvain) confirment leur
// courriel avant d'entrer. Le serveur n'ouvre aucune session tant que le code n'est pas bon ; cet
// écran ne fait que le saisir et le renvoyer. Le mot de passe reste en mémoire le temps de l'écran,
// car le serveur l'exige avec le code.
const TELEPHONE = "438-499-1120";
const DELAI_RENVOI_S = 60;

export default function VerifyCodeScreen({ email, password, message, onVerified, onBack }) {
  const [code, setCode] = useState("");
  const [info, setInfo] = useState(message || `Un code à six chiffres a été envoyé à ${email}.`);
  const [error, setError] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [attente, setAttente] = useState(DELAI_RENVOI_S);

  // Compte à rebours avant de pouvoir demander un nouveau code (le serveur refuse avant une minute).
  useEffect(() => {
    if (attente <= 0) return undefined;
    const t = setTimeout(() => setAttente((a) => a - 1), 1000);
    return () => clearTimeout(t);
  }, [attente]);

  const valider = async () => {
    const propre = code.replace(/\D/g, "");
    if (propre.length !== 6) return setError("Entrez les six chiffres du code reçu par courriel.");
    setError("");
    setEnvoi(true);
    try {
      const data = await api.verifyEmail(email, password, propre);
      await AsyncStorage.setItem("ts_token", data.token);
      await AsyncStorage.setItem("ts_user", JSON.stringify(data.user));
      onVerified(data.user);
    } catch (e) {
      setError(e.message);
      setEnvoi(false);
    }
  };

  const renvoyer = async () => {
    if (attente > 0) return;
    setError("");
    try {
      const r = await api.resendCode(email, password);
      setInfo(r.message || "Un nouveau code vient d'être envoyé.");
      setAttente(DELAI_RENVOI_S);
      // Compte déjà confirmé entre-temps (par exemple sur un autre appareil) : retour à la connexion.
      if (r.dejaConfirme) onBack();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack}><Text style={styles.retour}>← Retour à la connexion</Text></TouchableOpacity>
      <Text style={styles.title}>Confirmez votre courriel</Text>
      <Text style={styles.info}>{info}</Text>

      <TextInput
        style={styles.code}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="000000"
        placeholderTextColor="#3b4a68"
        autoFocus
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        onSubmitEditing={valider}
      />
      {!!error && <Text style={styles.erreur}>{error}</Text>}

      <TouchableOpacity style={[styles.btn, envoi && styles.btnOff]} disabled={envoi} onPress={valider}>
        <Text style={styles.btnText}>{envoi ? "Vérification…" : "Confirmer"}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btnSecond, attente > 0 && styles.btnSecondOff]} disabled={attente > 0} onPress={renvoyer}>
        <Text style={[styles.btnSecondText, attente > 0 && styles.btnSecondTextOff]}>
          {attente > 0 ? `Renvoyer le code (${attente} s)` : "Renvoyer le code"}
        </Text>
      </TouchableOpacity>

      <Text style={styles.aide}>
        Pas de courriel ? Vérifiez les indésirables, ou appelez le{" "}
        <Text style={styles.lien} onPress={() => Linking.openURL(`tel:${TELEPHONE.replace(/-/g, "")}`)}>{TELEPHONE}</Text>.
        Le code est valable 15 minutes.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  retour: { color: "#8b99b5", marginBottom: 16 },
  title: { color: "#f5a623", fontSize: 24, fontWeight: "700", marginBottom: 8 },
  info: { color: "#c9d1e0", fontSize: 14, lineHeight: 20, marginBottom: 20 },
  code: { backgroundColor: "#1d2c46", color: "#edeff3", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#28395a", fontSize: 30, letterSpacing: 10, textAlign: "center", fontWeight: "700", marginBottom: 10 },
  erreur: { color: "#e85d4c", marginBottom: 8, fontSize: 14 },
  btn: { backgroundColor: "#f5a623", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 },
  btnOff: { backgroundColor: "#28395a" },
  btnText: { color: "#1a1200", fontWeight: "700" },
  btnSecond: { borderRadius: 10, padding: 14, alignItems: "center", marginTop: 10, borderWidth: 1, borderColor: "#f5a623" },
  btnSecondOff: { borderColor: "#28395a" },
  btnSecondText: { color: "#f5a623", fontWeight: "700" },
  btnSecondTextOff: { color: "#8b99b5" },
  aide: { color: "#8b99b5", fontSize: 12, textAlign: "center", marginTop: 16, lineHeight: 17 },
  lien: { color: "#f5a623", textDecorationLine: "underline" },
});
