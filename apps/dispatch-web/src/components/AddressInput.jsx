import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

// Champ d'adresse avec autocomplétion. Deux sources : d'abord les adresses que la base connaît déjà
// (domiciles des clients, départs et destinations de courses passées), puis les suggestions de
// carte, Google Maps depuis le 6 octobre 2026 quand la clé est posée sur le serveur (sinon
// OpenStreetMap). Une suggestion Google n'a son point exact qu'une fois choisie : le détail est
// demandé à ce moment-là. Pour l'aéroport Montréal-Trudeau, seules les deux adresses du catalogue
// (Arrivées et P4) sont proposées.
//
// Audit du 7 octobre 2026 :
//   - F15 : une réponse lente pour une ANCIENNE frappe remplaçait les suggestions récentes, et le
//     détail d'une adresse choisie pouvait écraser un texte retapé entre-temps. Chaque recherche porte
//     désormais un numéro ; seule la dernière s'affiche, et un détail arrivé après une nouvelle
//     frappe est ignoré ;
//   - OPS-02 : sans clé Google, le serveur public OpenStreetMap n'autorise pas une recherche à chaque
//     frappe. On attend alors 1 seconde de pause et 5 caractères (le serveur, lui, limite à une
//     requête par seconde pour toute l'application) ;
//   - F20 : liste utilisable au clavier (flèches, Entrée, Échap) et annoncée aux lecteurs d'écran.
//
// `point` (facultatif) : { lat, confidence } de l'adresse actuelle, pour afficher si elle est vérifiée.

const nouvelleSession = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const PRECISES = ["porte", "verifie"];

// Fournisseur d'adresses du serveur, demandé une seule fois pour toute la console.
let fournisseur = null;
function fournisseurAdresses() {
  fournisseur ??= api.geocodeProvider ? api.geocodeProvider().then((r) => r?.fournisseur || "openstreetmap").catch(() => "openstreetmap") : Promise.resolve("openstreetmap");
  return fournisseur;
}

let compteurChamps = 0;

export default function AddressInput({ label, value, onChange, placeholder, point }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState("");
  const [actif, setActif] = useState(-1);
  const [rythme, setRythme] = useState({ delai: 350, minimum: 3 });
  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const derniereRecherche = useRef(0);
  const idRef = useRef(null);
  idRef.current ??= `adresse-${++compteurChamps}`;
  // Jeton de session Google : une session par adresse saisie, renouvelée après chaque choix.
  const sessionRef = useRef(nouvelleSession());

  useEffect(() => {
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    fournisseurAdresses().then((f) => { if (f !== "google") setRythme({ delai: 1000, minimum: 5 }); });
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      clearTimeout(debounceRef.current);
      derniereRecherche.current += 1; // toute réponse encore attendue sera ignorée
    };
  }, []);

  const handleChange = (text) => {
    onChange({ address: text, lat: null, lng: null, confidence: null, placeId: null });
    setErreur("");
    clearTimeout(debounceRef.current);
    const numero = ++derniereRecherche.current;
    if (text.trim().length < rythme.minimum) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const [known, geocoded] = await Promise.all([
          api.suggest("address", text).catch(() => []),
          api.geocodeSearch(text, sessionRef.current).catch(() => []),
        ]);
        if (numero !== derniereRecherche.current) return; // une frappe plus récente a pris le relais
        // Aéroport Montréal-Trudeau : les deux adresses du catalogue, et rien d'autre.
        const catalogue = geocoded.filter((g) => g.catalogue);
        if (catalogue.length) {
          setSuggestions(catalogue.map((g) => ({ ...g, known: false })));
          setActif(-1);
          setOpen(true);
          return;
        }
        const seen = new Set();
        const merged = [];
        for (const k of known) {
          const key = k.value.trim().toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push({ label: k.value, lat: k.data?.lat ?? null, lng: k.data?.lng ?? null, confidence: k.data?.confidence || null, known: true });
        }
        for (const g of geocoded) {
          const key = g.label.trim().toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push({ ...g, known: false });
        }
        setSuggestions(merged);
        setActif(-1);
        setOpen(merged.length > 0);
      } catch {
        if (numero === derniereRecherche.current) setSuggestions([]);
      } finally {
        if (numero === derniereRecherche.current) setLoading(false);
      }
    }, rythme.delai);
  };

  const select = async (s) => {
    setOpen(false);
    setSuggestions([]);
    setActif(-1);
    const numero = ++derniereRecherche.current;
    if (s.placeId && typeof s.lat !== "number") {
      // Suggestion Google : on demande l'adresse complète et son point exact.
      onChange({ address: s.label, lat: null, lng: null, confidence: null, placeId: null });
      setLoading(true);
      try {
        const d = await api.geocodePlace(s.placeId, sessionRef.current, { q: value, nom: s.nomLieu || "" });
        // Texte retapé entre-temps : le détail de l'ancienne adresse ne l'écrase pas.
        if (numero !== derniereRecherche.current) return;
        onChange({ address: d.label, lat: d.lat, lng: d.lng, confidence: d.confidence || null, placeId: d.placeId || s.placeId });
      } catch (e) {
        // Sans le détail, on garde le texte choisi : le serveur le vérifiera à l'enregistrement.
        if (numero === derniereRecherche.current) setErreur("Détail de l'adresse indisponible : elle sera vérifiée à l'enregistrement.");
      } finally {
        if (numero === derniereRecherche.current) setLoading(false);
        sessionRef.current = nouvelleSession();
      }
      return;
    }
    onChange({ address: s.label, lat: s.lat, lng: s.lng, confidence: s.confidence || null, placeId: s.placeId || null });
    sessionRef.current = nouvelleSession();
  };

  const clavier = (e) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActif((i) => Math.min(suggestions.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActif((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && actif >= 0) { e.preventDefault(); select(suggestions[actif]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  };

  const etat = !point || !String(value || "").trim()
    ? null
    : typeof point.lat === "number" && PRECISES.includes(point.confidence)
      ? { couleur: "#3fa796", texte: "✓ Adresse vérifiée sur la carte" }
      : typeof point.lat === "number"
        ? { couleur: "var(--muted)", texte: "Adresse choisie dans la liste (point approximatif : le chauffeur vérifiera le numéro)" }
        : { couleur: "var(--amber)", texte: "⚠ Adresse tapée à la main : choisissez-la dans la liste pour la valider" };
  const listeId = `${idRef.current}-liste`;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {label && <label htmlFor={idRef.current} style={{ display: "block", marginTop: 8 }}>{label}</label>}
      <input
        id={idRef.current}
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={clavier}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listeId}
        aria-activedescendant={actif >= 0 ? `${listeId}-${actif}` : undefined}
      />
      {etat && <div style={{ color: etat.couleur, fontSize: 12, marginTop: 3 }}>{etat.texte}</div>}
      {erreur && <div role="status" style={{ color: "var(--amber)", fontSize: 12, marginTop: 3 }}>{erreur}</div>}
      {open && (
        <div
          id={listeId}
          role="listbox"
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
            background: "#16233a", border: "1px solid var(--border)", borderRadius: 8,
            marginTop: 4, maxHeight: 240, overflowY: "auto",
          }}
        >
          {loading && <div style={{ padding: 10, fontSize: 13, color: "var(--muted)" }}>Recherche…</div>}
          {!loading && suggestions.map((s, i) => (
            <div
              key={i}
              id={`${listeId}-${i}`}
              role="option"
              aria-selected={i === actif}
              onClick={() => select(s)}
              style={{ padding: "8px 10px", fontSize: 13, cursor: "pointer", background: i === actif ? "rgba(245,166,35,0.15)" : "transparent", borderBottom: i < suggestions.length - 1 ? "1px solid var(--border)" : "none" }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {s.catalogue ? <strong>{s.nomLieu}</strong> : s.label}
              {s.catalogue && <div style={{ color: "var(--muted)", fontSize: 11 }}>{s.label}</div>}
              {/* Le nom du lieu aide à choisir (centre commercial, station), mais il n'entre pas
                  dans l'adresse enregistrée : devant une adresse civique, il ferait reconnaître la
                  mauvaise municipalité et changerait le prix. */}
              {!s.catalogue && s.nomLieu && <span style={{ color: "var(--muted)", fontSize: 11, marginLeft: 6 }}>· {s.nomLieu}</span>}
              {s.known && <span style={{ color: "var(--amber)", fontSize: 11, marginLeft: 6 }}>déjà utilisée</span>}
            </div>
          ))}
          {!loading && suggestions.some((s) => s.source === "google") && (
            <div style={{ padding: "4px 10px", fontSize: 10, color: "var(--muted)", textAlign: "right" }}>Suggestions Google Maps</div>
          )}
          {!loading && suggestions.some((s) => s.source === "openstreetmap") && (
            <div style={{ padding: "4px 10px", fontSize: 10, color: "var(--muted)", textAlign: "right" }}>
              Données <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ color: "var(--muted)" }}>© contributeurs OpenStreetMap</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
