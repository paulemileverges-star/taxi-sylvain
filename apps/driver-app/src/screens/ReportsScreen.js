import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { api, reportDownloadUrl } from "../lib/api";
import { jour } from "../lib/dates";
import { showAlert } from "../lib/alert";

// Dates à l'heure de Montréal, quel que soit le réglage du téléphone (6 octobre 2026).
const fmtDate = jour;

export default function ReportsScreen({ onBack }) {
  const [reports, setReports] = useState([]);
  const [erreur, setErreur] = useState("");
  const [charge, setCharge] = useState(false);

  // Une panne ne s'affiche plus comme « aucun récap » (audit du 7 octobre 2026, F08).
  const charger = () => {
    setErreur("");
    api.myReports().then((r) => { setReports(r); setCharge(true); }).catch((e) => setErreur(e.message || "Rapports indisponibles."));
  };
  useEffect(() => { charger(); }, []);

  // Lien d'export de 5 minutes demandé au serveur (SEC-19), puis ouvert dans le navigateur.
  const download = async (report, format) => {
    try {
      const url = await reportDownloadUrl(format, report.weekStart, report.weekEnd);
      await Linking.openURL(url);
    } catch (e) {
      showAlert("Téléchargement impossible", e.message || "Réessayez dans un instant.");
    }
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onBack}><Text style={styles.link}>← Retour</Text></TouchableOpacity>
        <Text style={styles.title}>Mes rapports</Text>
      </View>
      {erreur ? (
        <TouchableOpacity onPress={charger} accessibilityRole="button">
          <Text style={{ color: "#e85d4c", marginBottom: 10 }}>{erreur} Touchez pour réessayer.</Text>
        </TouchableOpacity>
      ) : null}
      <FlatList
        data={reports}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.week}>Semaine du {fmtDate(item.weekStart)} au {fmtDate(item.weekEnd)}</Text>
            <View style={styles.rowBetween}>
              <Text style={styles.stat}>{item.rideCount} courses</Text>
              <Text style={styles.stat}>{item.totalFare.toFixed(2)} $</Text>
              <Text style={styles.royalty}>{item.royaltyDue.toFixed(2)} $ redevance</Text>
            </View>
            <View style={styles.rowBetween}>
              <TouchableOpacity style={styles.smallBtn} onPress={() => download(item, "pdf")}>
                <Text style={styles.smallBtnText}>Télécharger PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: "#1d2c46" }]} onPress={() => download(item, "xlsx")}>
                <Text style={[styles.smallBtnText, { color: "#edeff3" }]}>Télécharger Excel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={charge ? <Text style={{ color: "#8b99b5" }}>Aucun récap disponible pour le moment.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  link: { color: "#f5a623" },
  title: { color: "#edeff3", fontSize: 20, fontWeight: "700" },
  card: { backgroundColor: "#16233a", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#28395a" },
  week: { color: "#edeff3", fontWeight: "700", marginBottom: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  stat: { color: "#8b99b5" },
  royalty: { color: "#f5a623", fontWeight: "700" },
  smallBtn: { backgroundColor: "#f5a623", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, flex: 1, marginRight: 6, alignItems: "center" },
  smallBtnText: { color: "#1a1200", fontWeight: "700", fontSize: 12 },
});
