import React from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking } from "react-native";

// Suppression d'un compte chauffeur : pour l'instant, elle passe par Taxi Sylvain.
//
// Supprimer un compte chauffeur efface aussi les récapitulatifs de la redevance de 10 % qu'il
// doit (relecture du 19 septembre 2026). En attendant la décision du propriétaire, le serveur
// refuse la suppression faite par le chauffeur lui-même ; cet écran l'explique d'emblée au lieu de
// demander un mot de passe pour refuser ensuite. Le Dispatch supprime le compte depuis la console
// une fois la redevance réglée. L'ancien écran (mot de passe + confirmation) est dans l'historique
// Git, prêt à revenir si le propriétaire choisit d'anonymiser les comptes au lieu de les effacer.
const PHONE = "438-499-1120";

export default function DeleteAccountScreen({ onBack }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: "#8b99b5", marginBottom: 12 }}>← Retour</Text></TouchableOpacity>
      <Text style={styles.title}>Supprimer mon compte</Text>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Demande à faire auprès de Taxi Sylvain</Text>
        <Text style={styles.infoText}>
          Pour supprimer un compte chauffeur, appelez Taxi Sylvain au {PHONE}. La redevance de vos
          courses doit d'abord être réglée ; votre compte est ensuite supprimé définitivement.
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Ce qui sera supprimé</Text>
      <Text style={styles.item}>• Votre compte et vos renseignements personnels : nom, courriel, téléphone, photos.</Text>
      <Text style={styles.item}>• Les messages que vous avez envoyés, vos notations et votre cédule.</Text>
      <Text style={styles.item}>• Les groupes que vous avez créés.</Text>

      <Text style={styles.sectionLabel}>Ce qui sera conservé</Text>
      <Text style={styles.item}>
        • Les courses effectuées restent dans les registres de Taxi Sylvain, sans lien avec votre compte.
      </Text>

      <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${PHONE.replace(/-/g, "")}`)}>
        <Text style={styles.callBtnText}>Appeler Taxi Sylvain</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { color: "#edeff3", fontSize: 22, fontWeight: "700", marginBottom: 16 },
  infoBox: { backgroundColor: "rgba(245,166,35,0.12)", borderRadius: 12, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: "#f5a623" },
  infoTitle: { color: "#f5a623", fontWeight: "700", marginBottom: 6 },
  infoText: { color: "#edeff3", fontSize: 13, lineHeight: 19 },
  sectionLabel: { color: "#8b99b5", fontSize: 12, textTransform: "uppercase", marginBottom: 8, marginTop: 4 },
  item: { color: "#edeff3", fontSize: 13, lineHeight: 19, marginBottom: 6 },
  callBtn: { backgroundColor: "#f5a623", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 16 },
  callBtnText: { color: "#1a1200", fontWeight: "700" },
});
