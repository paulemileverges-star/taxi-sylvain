import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../lib/api";

// Ouverture de compte par le client lui-même. Jusqu'au 20 septembre 2026, un nouveau client devait
// appeler Taxi Sylvain pour qu'on lui crée un compte : l'écran de connexion n'offrait aucune autre
// porte, alors que le serveur savait déjà inscrire (POST /auth/register, rôle CLIENT imposé).
// Le site public envoie maintenant des visiteurs vers « Réserver en ligne » : sans cet écran, ils
// arrivaient devant un mur.
const CONDITIONS = "https://api.taxisylvain.ca/conditions";
const CONFIDENTIALITE = "https://api.taxisylvain.ca/confidentialite";
const TELEPHONE = "438-499-1120";

// Vérifications faites ici pour expliquer l'erreur AVANT l'envoi ; le serveur revérifie tout.
export function problemeDeSaisie({ name, email, phone, password, confirmation }) {
  if (!name.trim()) return "Entrez votre nom.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return "Entrez un courriel valide, par exemple nom@exemple.ca.";
  // Un numéro nord-américain a 10 chiffres ; on accepte l'indicatif 1 devant.
  const chiffres = phone.replace(/\D/g, "");
  if (chiffres.length < 10 || chiffres.length > 11) return "Entrez un numéro de téléphone à 10 chiffres, par exemple 450 555-1234.";
  if (password.length < 6) return "Le mot de passe doit contenir au moins 6 caractères.";
  if (password !== confirmation) return "Les deux mots de passe ne sont pas identiques.";
  return null;
}

export default function RegisterScreen({ onRegistered, onBack, onVerification }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const submit = async () => {
    const probleme = problemeDeSaisie({ name, email, phone, password, confirmation });
    if (probleme) return setError(probleme);

    setError("");
    setEnvoi(true);
    try {
      const data = await api.register(name.trim(), email.trim(), phone.trim(), password);
      // Compte créé, code envoyé par courriel : aucune session tant qu’il n’est pas saisi.
      if (data.verificationRequired) return onVerification?.({ email: data.email || email.trim(), password, message: data.error });
      await AsyncStorage.setItem("ts_token", data.token);
      await AsyncStorage.setItem("ts_user", JSON.stringify(data.user));
      onRegistered(data.user);
    } catch (e) {
      // Le serveur répond déjà en français : courriel déjà utilisé, champs manquants, trop de
      // tentatives, ou coupure réseau.
      setError(e.message);
      setEnvoi(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={onBack}><Text style={styles.retour}>← Retour</Text></TouchableOpacity>
      <Text style={styles.title}>Créer mon compte</Text>
      <Text style={styles.sous}>Quelques secondes, et vous pourrez réserver vos courses en ligne.</Text>

      <Text style={styles.label}>Nom complet</Text>
      <TextInput style={styles.input} placeholder="Marie Tremblay" placeholderTextColor="#8b99b5" value={name} onChangeText={setName} autoCapitalize="words" />

      <Text style={styles.label}>Courriel</Text>
      <TextInput style={styles.input} placeholder="marie@exemple.ca" placeholderTextColor="#8b99b5" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />

      <Text style={styles.label}>Téléphone</Text>
      <TextInput style={styles.input} placeholder="450 555-1234" placeholderTextColor="#8b99b5" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Text style={styles.aide}>Votre chauffeur ne le voit pas : il sert à Taxi Sylvain pour vous joindre.</Text>

      <Text style={styles.label}>Mot de passe</Text>
      <TextInput style={styles.input} placeholder="Au moins 6 caractères" placeholderTextColor="#8b99b5" value={password} onChangeText={setPassword} secureTextEntry />

      <Text style={styles.label}>Confirmer le mot de passe</Text>
      <TextInput style={styles.input} placeholder="Le même mot de passe" placeholderTextColor="#8b99b5" value={confirmation} onChangeText={setConfirmation} secureTextEntry />

      {!!error && <Text style={styles.erreur}>{error}</Text>}

      <TouchableOpacity style={[styles.btn, envoi && styles.btnOff]} disabled={envoi} onPress={submit}>
        <Text style={styles.btnText}>{envoi ? "Création en cours…" : "Créer mon compte"}</Text>
      </TouchableOpacity>

      <Text style={styles.legal}>
        En créant un compte, vous acceptez les{" "}
        <Text style={styles.lien} onPress={() => Linking.openURL(CONDITIONS)}>conditions d'utilisation</Text> et la{" "}
        <Text style={styles.lien} onPress={() => Linking.openURL(CONFIDENTIALITE)}>politique de confidentialité</Text>.
      </Text>

      <Text style={styles.aide}>
        Vous avez déjà réservé par téléphone ? Votre compte existe peut-être déjà. Appelez le{" "}
        <Text style={styles.lien} onPress={() => Linking.openURL(`tel:${TELEPHONE.replace(/-/g, "")}`)}>{TELEPHONE}</Text> plutôt que d'en créer un second.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 48 },
  retour: { color: "#8b99b5", marginBottom: 12 },
  title: { color: "#f5a623", fontSize: 24, fontWeight: "700", marginBottom: 6 },
  sous: { color: "#8b99b5", fontSize: 14, marginBottom: 20 },
  label: { color: "#8b99b5", fontSize: 12, textTransform: "uppercase", marginBottom: 6 },
  input: { backgroundColor: "#1d2c46", color: "#edeff3", borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#28395a" },
  aide: { color: "#8b99b5", fontSize: 12, marginTop: -6, marginBottom: 14, lineHeight: 17 },
  erreur: { color: "#e85d4c", marginBottom: 10, fontSize: 14 },
  btn: { backgroundColor: "#f5a623", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 6 },
  btnOff: { backgroundColor: "#28395a" },
  btnText: { color: "#1a1200", fontWeight: "700" },
  legal: { color: "#8b99b5", fontSize: 12, lineHeight: 18, marginTop: 16 },
  lien: { color: "#f5a623", textDecorationLine: "underline" },
});
