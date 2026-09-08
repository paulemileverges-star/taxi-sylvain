import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { api, reportDownloadUrl } from "../lib/api";

function fmtDate(d) {
  return new Date(d).toLocaleDateString("fr-CA");
}

export default function ReportsScreen({ onBack }) {
  const [reports, setReports] = useState([]);

  useEffect(() => { api.myReports().then(setReports); }, []);

  const download = async (report, format) => {
    const url = await reportDownloadUrl(format, report.weekStart, report.weekEnd);
    Linking.openURL(url);
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onBack}><Text style={styles.link}>← Retour</Text></TouchableOpacity>
        <Text style={styles.title}>Mes rapports</Text>
      </View>
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
        ListEmptyComponent={<Text style={{ color: "#8b99b5" }}>Aucun récap disponible pour le moment.</Text>}
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
