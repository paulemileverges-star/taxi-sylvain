import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { api } from "../lib/api";
import { showAlert } from "../lib/alert";

// Google Play et Apple exigent que le client puisse supprimer son compte depuis l'app.
// La confirmation passe par showAlert (jamais Alert.alert) : l'app est aussi publiée en web,
// où Alert.alert n'affiche rien du tout.
export default function DeleteAccountScreen({ onBack, onDeleted }) {
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Bouton actif seulement si la case est cochée et le mot de passe saisi.
  const canSubmit = understood && password.length > 0 && !deleting;

  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteAccount(password);
      onDeleted?.();
    } catch (e) {
      // Le serveur renvoie déjà un message en français (course en cours, mot de passe, rôle).
      showAlert("Suppression impossible", e.message);
      setDeleting(false);
    }
  };

  const confirm = () => {
    if (!canSubmit) return;
    showAlert(
      "Supprimer mon compte",
      "Cette suppression est définitive. Vous ne pourrez plus vous connecter et vos informations personnelles seront effacées.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer", style: "destructive", onPress: remove },
      ]
    );
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: "#8b99b5", marginBottom: 12 }}>← Retour</Text></TouchableOpacity>
      <Text style={styles.title}>Supprimer mon compte</Text>

      <View style={styles.warnBox}>
        <Text style={styles.warnTitle}>Attention : c'est définitif</Text>
        <Text style={styles.warnText}>
          La suppression est immédiate. Votre compte ne peut pas être récupéré, même en appelant Taxi Sylvain.
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Ce qui est supprimé</Text>
      <Text style={styles.item}>• Votre compte et vos renseignements personnels : nom, courriel, téléphone, adresse, photos, mémo.</Text>
      <Text style={styles.item}>• Les messages que vous avez envoyés.</Text>
      <Text style={styles.item}>• Vos notations.</Text>
      <Text style={styles.item}>• Les groupes que vous avez créés.</Text>
      <Text style={styles.item}>• Vos notifications sur cet appareil.</Text>

      <Text style={styles.sectionLabel}>Ce qui est conservé</Text>
      <Text style={styles.item}>
        • Vos courses passées restent dans les registres de Taxi Sylvain, mais elles ne sont plus reliées
        à votre compte. C'est une obligation comptable (redevance de 10 %).
      </Text>

      <Text style={styles.sectionLabel}>Confirmation</Text>
      <Text style={styles.hint}>La suppression est refusée tant qu'une course est en cours. Attendez la fin de la course, ou appelez Taxi Sylvain pour l'annuler.</Text>
      <TextInput
        style={styles.input}
        placeholder="Votre mot de passe"
        placeholderTextColor="#8b99b5"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.checkRow} onPress={() => setUnderstood((v) => !v)}>
        <View style={[styles.checkBox, understood && styles.checkBoxOn]}>
          {understood ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
        <Text style={styles.checkLabel}>Je comprends que la suppression est définitive</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.dangerBtn, !canSubmit && styles.dangerBtnOff]} disabled={!canSubmit} onPress={confirm}>
        <Text style={[styles.dangerBtnText, !canSubmit && styles.dangerBtnTextOff]}>
          {deleting ? "Suppression en cours…" : "Supprimer définitivement mon compte"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { color: "#edeff3", fontSize: 22, fontWeight: "700", marginBottom: 16 },
  warnBox: { backgroundColor: "rgba(225,84,63,0.12)", borderRadius: 12, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: "#e1543f" },
  warnTitle: { color: "#e1543f", fontWeight: "700", marginBottom: 6 },
  warnText: { color: "#edeff3", fontSize: 13, lineHeight: 19 },
  sectionLabel: { color: "#8b99b5", fontSize: 12, textTransform: "uppercase", marginBottom: 8 },
  item: { color: "#edeff3", fontSize: 13, lineHeight: 19, marginBottom: 6 },
  hint: { color: "#8b99b5", fontSize: 12, marginBottom: 10 },
  input: { backgroundColor: "#16233a", color: "#edeff3", borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#28395a" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, marginBottom: 6 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: "#28395a", backgroundColor: "#16233a", alignItems: "center", justifyContent: "center" },
  checkBoxOn: { borderColor: "#e1543f", backgroundColor: "rgba(225,84,63,0.2)" },
  checkMark: { color: "#e1543f", fontWeight: "700", fontSize: 13, lineHeight: 15 },
  checkLabel: { color: "#edeff3", fontSize: 14, flexShrink: 1 },
  dangerBtn: { backgroundColor: "#e1543f", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 10 },
  dangerBtnOff: { backgroundColor: "#28395a" },
  dangerBtnText: { color: "#fff", fontWeight: "700" },
  dangerBtnTextOff: { color: "#8b99b5" },
});
