import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Switch } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../lib/api";
import { showAlert } from "../lib/alert";

const OPTIONS = [
  { minutes: 1440, label: "1 jour avant" },
  { minutes: 120, label: "2 heures avant" },
  { minutes: 60, label: "1 heure avant" },
  { minutes: 30, label: "30 minutes avant" },
  { minutes: 10, label: "10 minutes avant" },
];

export default function NotificationSettingsScreen({ user, onSaved, onBack }) {
  const [offsets, setOffsets] = useState(user?.reminderOffsets ?? [60, 10]);
  const [saving, setSaving] = useState(false);

  const toggle = (minutes) => {
    setOffsets((prev) => (prev.includes(minutes) ? prev.filter((m) => m !== minutes) : [...prev, minutes]));
  };

  const save = async (next) => {
    setSaving(true);
    try {
      await api.updateNotificationPrefs(next);
      const updatedUser = { ...user, reminderOffsets: next };
      await AsyncStorage.setItem("ts_user", JSON.stringify(updatedUser));
      onSaved?.(updatedUser);
    } catch (e) {
      showAlert("Erreur", e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: "#8b99b5", marginBottom: 12 }}>← Retour</Text></TouchableOpacity>
      <Text style={styles.title}>Notifications</Text>
      <Text style={styles.subtitle}>Rappelez-moi mes courses prévues :</Text>
      {OPTIONS.map((o) => (
        <View key={o.minutes} style={styles.row}>
          <Text style={styles.label}>{o.label}</Text>
          <Switch
            value={offsets.includes(o.minutes)}
            onValueChange={() => { const next = offsets.includes(o.minutes) ? offsets.filter((m) => m !== o.minutes) : [...offsets, o.minutes]; setOffsets(next); save(next); }}
            trackColor={{ false: "#28395a", true: "#f5a623" }}
            thumbColor="#edeff3"
          />
        </View>
      ))}
      <TouchableOpacity
        style={styles.disableBtn}
        disabled={saving || offsets.length === 0}
        onPress={() => { setOffsets([]); save([]); }}
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
  disableBtn: { padding: 12, alignItems: "center", marginTop: 8 },
  disableBtnText: { color: "#e85d4c", fontWeight: "600" },
});
