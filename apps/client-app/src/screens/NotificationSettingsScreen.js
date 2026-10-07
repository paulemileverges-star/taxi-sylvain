import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Switch } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../lib/api";

const OPTIONS = [
  { minutes: 1440, label: "1 jour avant" },
  { minutes: 120, label: "2 heures avant" },
  { minutes: 60, label: "1 heure avant" },
  { minutes: 30, label: "30 minutes avant" },
  { minutes: 10, label: "10 minutes avant" },
];

// Audit du 7 octobre 2026 (F12) : chaque bascule envoyait sa propre requête ; deux bascules rapides
// pouvaient arriver dans le désordre, et une réponse ancienne écrasait le dernier choix (rappel
// perdu). Les enregistrements passent maintenant par une file : un seul à la fois, toujours le choix
// le plus récent, et en cas d'échec l'écran revient à ce que le serveur a réellement enregistré.
export default function NotificationSettingsScreen({ user, onSaved, onBack }) {
  const [offsets, setOffsets] = useState(user?.reminderOffsets ?? [60, 10]);
  const [etat, setEtat] = useState("");
  const enregistre = useRef(user?.reminderOffsets ?? [60, 10]); // dernière valeur confirmée par le serveur
  const voulu = useRef(null);
  const enCours = useRef(false);
  const monte = useRef(true);
  useEffect(() => () => { monte.current = false; }, []);

  const enregistrer = async () => {
    if (enCours.current) return;
    enCours.current = true;
    try {
      while (voulu.current) {
        const aEnvoyer = voulu.current;
        voulu.current = null;
        if (monte.current) setEtat("Enregistrement…");
        try {
          const r = await api.updateNotificationPrefs(aEnvoyer);
          enregistre.current = r?.reminderOffsets ?? aEnvoyer;
        } catch (e) {
          if (!voulu.current) {
            // Rien de plus récent à envoyer : l'écran revient à la valeur réellement enregistrée.
            if (monte.current) {
              setOffsets(enregistre.current);
              setEtat(`Non enregistré : ${e.message}`);
            }
            return;
          }
        }
      }
      const updatedUser = { ...user, reminderOffsets: enregistre.current };
      await AsyncStorage.setItem("ts_user", JSON.stringify(updatedUser));
      onSaved?.(updatedUser);
      if (monte.current) setEtat("Enregistré.");
    } finally {
      enCours.current = false;
    }
  };

  const changer = (next) => {
    setOffsets(next);
    voulu.current = next;
    enregistrer();
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <TouchableOpacity onPress={onBack} accessibilityRole="button"><Text style={{ color: "#8b99b5", marginBottom: 12 }}>← Retour</Text></TouchableOpacity>
      <Text style={styles.title} accessibilityRole="header">Notifications</Text>
      <Text style={styles.subtitle}>Rappelez-moi mes courses réservées :</Text>
      {OPTIONS.map((o) => (
        <View key={o.minutes} style={styles.row}>
          <Text style={styles.label}>{o.label}</Text>
          <Switch
            value={offsets.includes(o.minutes)}
            onValueChange={() => changer(offsets.includes(o.minutes) ? offsets.filter((m) => m !== o.minutes) : [...offsets, o.minutes])}
            trackColor={{ false: "#28395a", true: "#f5a623" }}
            thumbColor="#edeff3"
            accessibilityLabel={`Rappel ${o.label}`}
          />
        </View>
      ))}
      {etat ? <Text style={[styles.etat, etat.startsWith("Non") && { color: "#e85d4c" }]} accessibilityLiveRegion="polite">{etat}</Text> : null}
      <TouchableOpacity
        style={styles.disableBtn}
        disabled={offsets.length === 0}
        onPress={() => changer([])}
        accessibilityRole="button"
      >
        <Text style={styles.disableBtnText}>Désactiver tous les rappels</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: "#edeff3", fontSize: 22, fontWeight: "700", marginBottom: 6 },
  subtitle: { color: "#8b99b5", fontSize: 13, marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#16233a", borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#28395a" },
  label: { color: "#edeff3", fontSize: 15 },
  etat: { color: "#3fa796", fontSize: 13, marginTop: 4 },
  disableBtn: { padding: 12, alignItems: "center", marginTop: 8 },
  disableBtnText: { color: "#e85d4c", fontWeight: "600" },
});
