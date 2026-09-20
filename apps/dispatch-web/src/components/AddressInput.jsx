import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

// Champ d'adresse avec autocomplétion. Deux sources, dans cet ordre : d'abord les adresses que la
// base connaît déjà (domiciles des clients, départs et destinations de courses passées), puis les
// suggestions cartographiques (Nominatim/OpenStreetMap, via le proxy backend). Saisie debouncée à
// 350 ms pour rester raisonnable vis-à-vis du service gratuit.
export default function AddressInput({ label, value, onChange, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleChange = (text) => {
    onChange({ address: text, lat: null, lng: null });
    clearTimeout(debounceRef.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const [known, geocoded] = await Promise.all([
          api.suggest("address", text).catch(() => []),
          api.geocodeSearch(text).catch(() => []),
        ]);
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
        setOpen(merged.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  const select = (s) => {
    onChange({ address: s.label, lat: s.lat, lng: s.lng, confidence: s.confidence || null });
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {label && <label style={{ display: "block", marginTop: 8 }}>{label}</label>}
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
      />
      {open && (
        <div
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
            background: "#16233a", border: "1px solid var(--border)", borderRadius: 8,
            marginTop: 4, maxHeight: 220, overflowY: "auto",
          }}
        >
          {loading && <div style={{ padding: 10, fontSize: 13, color: "var(--muted)" }}>Recherche…</div>}
          {!loading && suggestions.map((s, i) => (
            <div
              key={i}
              onClick={() => select(s)}
              style={{ padding: "8px 10px", fontSize: 13, cursor: "pointer", borderBottom: i < suggestions.length - 1 ? "1px solid var(--border)" : "none" }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {s.label}
              {/* Le nom du lieu aide à choisir (centre commercial, station), mais il n'entre pas
                  dans l'adresse enregistrée : devant une adresse civique, il ferait reconnaître la
                  mauvaise municipalité et changerait le prix. */}
              {s.nomLieu && <span style={{ color: "var(--muted)", fontSize: 11, marginLeft: 6 }}>· {s.nomLieu}</span>}
              {s.known && <span style={{ color: "var(--amber)", fontSize: 11, marginLeft: 6 }}>déjà utilisée</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
