import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

// Champ de saisie intuitive : dès 2 caractères, propose ce que la base contient déjà pour ce type
// d'information (clients, chauffeurs, adresses utilisées, numéros de vol). Choisir une proposition
// remplit le champ — et, si le parent le demande, les champs liés (téléphone, adresse...).
export default function Suggest({ field, value, onChange, onSelect, placeholder, type = "text", label, style }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef(null);
  const blurTimer = useRef(null);

  useEffect(() => () => { clearTimeout(debounce.current); clearTimeout(blurTimer.current); }, []);

  const handleChange = (text) => {
    onChange(text);
    clearTimeout(debounce.current);
    if (!text || text.trim().length < 2) { setItems([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      try {
        const results = await api.suggest(field, text.trim());
        setItems(results);
        setOpen(results.length > 0);
      } catch {
        setItems([]);
        setOpen(false);
      }
    }, 250);
  };

  const choose = (item) => {
    setOpen(false);
    setItems([]);
    onChange(item.value);
    onSelect?.(item);
  };

  return (
    <div style={{ position: "relative", ...style }}>
      {label && <label style={{ display: "block" }}>{label}</label>}
      <input
        className="input"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
        autoComplete="off"
      />
      {open && (
        <div className="suggest-list">
          {items.map((item, i) => (
            <button key={i} type="button" className="suggest-item" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(item)}>
              <span>{item.label}</span>
              {item.detail && <span className="suggest-detail">{item.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
