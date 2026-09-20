import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { api } from "../lib/api";
import { showAlert } from "../lib/alert";

// Google Play et Apple exigent que le client puisse demander la suppression de son compte depuis
// l'app. Décision du propriétaire du 20 septembre 2026 : ce n'est plus immédiat. La demande part à
// Taxi Sylvain, qui la valide (le compte est alors effacé) ou la refuse, sous 30 jours. D'ici là le
// compte reste utilisable, et la demande s'annule ici même. showAlert et jamais Alert.alert : l'app
// est aussi publiée en web, où Alert.alert n'affiche rien.
const DELAI_JOURS = 30;
const fmtDate = (d) => new Date(d).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });
const limite = (d) => new Date(new Date(d).getTime() + DELAI_JOURS * 86400000);

export default function DeleteAccountScreen({ user, onBack, onRequested, onCancelled }) {
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [sending, setSending] = useState(false);
  const enAttente = Boolean(user?.deletionRequestedAt);
  const canSubmit = understood && password.length > 0 && !sending;

  const demander = async () => {
    setSending(true);
    try {
      const data = await api.deleteAccount(password);
      showAlert("Demande envoyée", data.message || "Votre demande a été envoyée à Taxi Sylvain.", [{ text: "OK", onPress: () => onRequested?.(data) }]);
    } catch (e) {
      // Le serveur répond déjà en français (mot de passe incorrect, rôle non autorisé).
      showAlert("Demande impossible", e.message);
      setSending(false);
    }
  };

  const confirm = () => {
    if (!canSubmit) return;
    showAlert(
      "Demander la suppression",
      `Taxi Sylvain traitera votre demande sous ${DELAI_JOURS} jours et vous écrira sa décision. Une fois validée, la suppression est définitive.`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Envoyer la demande", style: "destructive", onPress: demander },
      ]
    );
  };

  const annulerDemande = () => {
    showAlert("Annuler ma demande", "Votre compte restera actif et Taxi Sylvain ne le supprimera pas.", [
      { text: "Non", style: "cancel" },
      { text: "Oui, annuler la demande", onPress: async () => { try { await api.cancelDeletion(); onCancelled?.(); } catch (e) { showAlert("Erreur", e.message); } } },
    ]);
  };

  if (enAttente) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <TouchableOpacity onPress={onBack}><Text style={{ color: "#8b99b5", marginBottom: 12 }}>← Retour</Text></TouchableOpacity>
        <Text style={styles.title}>Demande de suppression envoyée</Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Demande envoyée le {fmtDate(user.deletionRequestedAt)}</Text>
          <Text style={styles.infoText}>
            Taxi Sylvain la traitera au plus tard le {fmtDate(limite(user.deletionRequestedAt))} et vous écrira sa décision par courriel.
            D'ici là, votre compte reste utilisable : vous pouvez réserver et suivre vos courses normalement.
          </Text>
        </View>
        <TouchableOpacity style={styles.outlineBtn} onPress={annulerDemande}>
          <Text style={styles.outlineBtnText}>Annuler ma demande de suppression</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: "#8b99b5", marginBottom: 12 }}>← Retour</Text></TouchableOpacity>
      <Text style={styles.title}>Supprimer mon compte</Text>

      <View style={styles.warnBox}>
        <Text style={styles.warnTitle}>Comment ça se passe</Text>
        <Text style={styles.warnText}>
          Vous envoyez une demande. Taxi Sylvain la valide ou la refuse sous {DELAI_JOURS} jours et vous écrit sa décision.
          D'ici là, votre compte reste utilisable et vous pouvez annuler la demande. Une fois validée, la suppression est définitive.
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Ce qui est supprimé à la validation</Text>
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
      <Text style={styles.hint}>La suppression ne peut pas être validée tant qu'une de vos courses est en cours. Taxi Sylvain peut aussi refuser la demande ; vous en recevez la raison par courriel.</Text>
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
        <Text style={styles.checkLabel}>Je comprends qu'une fois validée, la suppression est définitive</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.dangerBtn, !canSubmit && styles.dangerBtnOff]} disabled={!canSubmit} onPress={confirm}>
        <Text style={[styles.dangerBtnText, !canSubmit && styles.dangerBtnTextOff]}>
          {sending ? "Envoi de la demande…" : "Demander la suppression de mon compte"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { color: "#edeff3", fontSize: 22, fontWeight: "700", marginBottom: 16 },
  warnBox: { backgroundColor: "rgba(245,166,35,0.12)", borderRadius: 12, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: "#f5a623" },
  warnTitle: { color: "#f5a623", fontWeight: "700", marginBottom: 6 },
  warnText: { color: "#edeff3", fontSize: 13, lineHeight: 19 },
  infoBox: { backgroundColor: "#16233a", borderRadius: 12, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: "#f5a623" },
  infoTitle: { color: "#f5a623", fontWeight: "700", marginBottom: 6 },
  infoText: { color: "#edeff3", fontSize: 13, lineHeight: 19 },
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
  outlineBtn: { borderWidth: 1, borderColor: "#f5a623", borderRadius: 12, padding: 14, alignItems: "center" },
  outlineBtnText: { color: "#f5a623", fontWeight: "700" },
});
