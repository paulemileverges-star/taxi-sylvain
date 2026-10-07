import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { playSound } from "../lib/sound.js";
import AddressInput from "../components/AddressInput.jsx";
import { matchedFields } from "../lib/clientSearch.js";

function ClientCard({ client, onDelete, onEdit, onConfirmEmail, onResetPassword, masque, trouvePar }) {
  const [notes, setNotes] = useState(client.notes || "");
  // Dernière valeur enregistrée sur le serveur. Audit du 7 octobre 2026 (F22) : la comparaison se
  // faisait avec l'ancienne valeur de la liste, et deux secondes après un enregistrement réussi la
  // fiche affichait de nouveau « Modifications non enregistrées ».
  const [reference, setReference] = useState(client.notes || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [erreurMemo, setErreurMemo] = useState("");
  const dirty = notes !== reference;

  // La fiche est recréée à chaque rechargement de la liste : on resynchronise le mémo avec la
  // valeur du serveur, sinon un ancien texte encore affiché pouvait écraser une modification faite
  // ailleurs (bouton Modifier, import). L'adresse, elle, ne se modifie plus que par « Modifier ».
  useEffect(() => { setNotes(client.notes || ""); setReference(client.notes || ""); }, [client.notes]);

  const save = async () => {
    setSaving(true);
    setErreurMemo("");
    try {
      const r = await api.updateClientNotes(client.id, notes.trim() || null);
      const enregistre = r?.notes ?? (notes.trim() || "");
      setReference(enregistre || "");
      setNotes(enregistre || "");
      playSound("action");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      // Le texte saisi reste là, pour réessayer.
      setErreurMemo(`Non enregistré : ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const aUnPrixNegocie = ["YUL", "YHU", "REM"].some((code) => client.sources?.[code] === "client");

  // Une fiche écartée par la recherche est MASQUÉE, jamais retirée de la page : la retirer
  // détruirait le mémo en cours de saisie et la position de lecture.
  return (
    <div className="card" style={masque ? { display: "none" } : undefined}>
      <div className="row">
        <div>
          <div>
            {client.name}
            {/* « jean » ramène aussi les habitants de Saint-Jean-sur-Richelieu : sans cette
                mention, la fiche semble apparaître sans raison. */}
            {trouvePar?.length > 0 && !trouvePar.includes("nom") && (
              <span className="chip" style={{ marginLeft: 8 }}>trouvé par : {trouvePar.join(", ")}</span>
            )}
          </div>
          <div style={{ color: "#8b99b5", fontSize: 13 }}>
            {client.email || "(pas de courriel)"} · {client.phone}
            {client.email && client.emailVerifiedAt === null && (
              <button className="btn outline" style={{ marginLeft: 8 }} title={"Ce compte n’a pas encore saisi le code reçu par courriel. Confirmer à sa place le laisse se connecter sans code."} onClick={() => onConfirmEmail(client)}>Courriel non confirmé · Confirmer</button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Pas de note fictive : sans avis réel, la fiche le dit (audit du 7 octobre 2026, B17). */}
          <span className="chip">{client.ratingAvg != null ? `★ ${client.ratingAvg.toFixed(1)}` : "Aucune note"}</span>
          <button className="btn outline" onClick={() => onEdit(client)}>Modifier</button>
          <button className="btn outline" title="Donner un nouveau mot de passe temporaire (ferme ses sessions ouvertes)" onClick={() => onResetPassword(client)}>Mot de passe</button>
          <button className="btn red" onClick={() => onDelete(client)}>Supprimer</button>
        </div>
      </div>
      <div className="field-row" style={{ marginTop: 10 }}>
        <span className="field-label">Adresse (domicile) :</span>
        <span>{client.address || <em style={{ color: "var(--muted)" }}>non renseignée — bouton Modifier</em>}</span>
      </div>

      {/* Tarifs depuis le domicile du client vers les trois destinations habituelles.
          Un prix négocié avec ce client l'emporte sur la grille des municipalités. */}
      <div className="price-tiles">
        {["YUL", "YHU", "REM"].map((code) => {
          const price = client.prices?.[code];
          return (
            <div key={code} className={`price-tile ${price != null ? "has-price" : ""}`}>
              <div className="price-tile-code">{code}</div>
              <div className="price-tile-value">{price != null ? `${price.toFixed(2)} $` : "—"}</div>
              {/* Sans cette mention, on chercherait l'explication du montant dans la page Tarifs. */}
              {client.sources?.[code] === "client" && <div style={{ fontSize: 10, color: "var(--amber)" }}>prix négocié</div>}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
        {aUnPrixNegocie
          ? client.address
            ? `Prix négociés appliqués. Les autres tarifs viennent de la grille${client.zoneName ? ` (${client.zoneName})` : " — municipalité non reconnue"}.`
            : "Prix négociés appliqués ; adresse non renseignée, les autres tarifs restent à confirmer."
          : client.address
            ? client.zoneName
              ? `Tarifs depuis ${client.zoneName} (grille Tarifs).`
              : "Municipalité non reconnue dans la grille — voir la page Tarifs."
            : "Renseignez l'adresse du client pour afficher ses tarifs."}
      </div>
      <label style={{ display: "block", marginTop: 10, fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Mémo et préférences (visible uniquement par le Dispatch)
      </label>
      <textarea
        className="input"
        style={{ marginTop: 6, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
        placeholder="ex. Préfère un véhicule spacieux, toujours 2 valises, allergique aux parfums, client fidèle du jeudi soir…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="row" style={{ marginTop: 6 }}>
        <span role="status" style={{ fontSize: 12, color: erreurMemo ? "#e85d4c" : saved ? "#3fa796" : "var(--muted)" }}>
          {erreurMemo || (saved ? "Enregistré." : dirty ? "Modifications non enregistrées." : "")}
        </span>
        <button className="btn outline" disabled={!dirty || saving} onClick={save}>
          {saving ? "Enregistrement…" : "Enregistrer le mémo"}
        </button>
      </div>
    </div>
  );
}

const EMPTY_FORM = { name: "", email: "", phone: "", address: "", notes: "", priceYUL: "", priceYHU: "", priceREM: "" };

// Les trois champs de prix négocié, communs aux fenêtres « Nouveau client » et « Modifier ».
function ChampsTarifs({ form, setForm }) {
  return (
    <div style={{ marginTop: 12, padding: 10, border: "1px solid #28395a", borderRadius: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Tarifs négociés de ce client</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
        Laisser vide = prix de la grille Tarifs. Un prix saisi ici s'applique à toutes ses courses vers cette destination.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {["YUL", "YHU", "REM"].map((code) => (
          <div key={code} style={{ flex: 1 }}>
            <label style={{ fontSize: 12 }}>{code} ($)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="grille"
              value={form[`price${code}`]}
              onChange={(e) => setForm({ ...form, [`price${code}`]: e.target.value })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null); // client en cours de modification
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editError, setEditError] = useState("");
  const fileInputRef = React.useRef(null);

  const openEdit = (client) => {
    setEditing(client);
    setEditForm({
      name: client.name || "", email: client.email || "", phone: client.phone || "",
      address: client.address || "", notes: client.notes || "",
      priceYUL: client.priceYUL ?? "", priceYHU: client.priceYHU ?? "", priceREM: client.priceREM ?? "",
    });
    setEditError("");
  };

  const saveEdit = async () => {
    setEditError("");
    try {
      await api.updateClient(editing.id, editForm);
      setEditing(null);
      playSound("action");
      load();
    } catch (e) {
      setEditError(e.message);
    }
  };

  // Une panne ne s'affiche plus comme une liste vide (audit du 7 octobre 2026, F08).
  const [erreurListe, setErreurListe] = useState("");
  const load = () => api.listClients()
    .then((liste) => { setClients(liste); setErreurListe(""); })
    .catch((e) => setErreurListe(`Impossible de charger les clients : ${e.message}`));
  useEffect(() => { load(); }, []);

  const remove = async (client) => {
    if (!window.confirm(`Supprimer le compte de ${client.name} ? Cette action est définitive.`)) return;
    try {
      await api.deleteClient(client.id);
      playSound("action");
    } catch (e) {
      alert(`Suppression impossible : ${e.message}`);
    }
    load();
  };

  // Nouveau mot de passe temporaire (client qui a perdu le sien, ou compte importé) : montré une
  // seule fois, et ses sessions ouvertes sont fermées (audit du 7 octobre 2026, B05).
  const reinitialiser = async (client) => {
    if (!window.confirm(`Donner un nouveau mot de passe temporaire à ${client.name} ? Ses sessions ouvertes seront fermées.`)) return;
    try {
      const r = await api.resetClientPassword(client.id);
      playSound("action");
      setCredentials(r.tempPassword);
    } catch (e) {
      alert(`Réinitialisation impossible : ${e.message}`);
    }
  };

  // Porte de secours : le client n’a pas reçu son code de confirmation. Le Dispatch confirme à
  // sa place, après l’avoir eu au téléphone.
  const confirmerCourriel = async (client) => {
    if (!window.confirm(`Confirmer le courriel de ${client.name} à sa place ? Il pourra se connecter sans code.`)) return;
    try {
      await api.confirmEmail(client.id);
      playSound("action");
      load();
    } catch (e) {
      alert(`Confirmation impossible : ${e.message}`);
    }
  };

  const createClient = async () => {
    setError("");
    try {
      const client = await api.createClient(form);
      setForm(EMPTY_FORM);
      setShowAdd(false);
      playSound("action");
      load();
      if (client.tempPassword) setCredentials(client.tempPassword);
    } catch (e) {
      setError(e.message);
    }
  };

  const exportAs = async (format) => {
    setExporting(true);
    try {
      await api.exportClients(format);
    } catch (e) {
      alert(e.message);
    } finally {
      setExporting(false);
    }
  };

  const importFile = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const result = await api.importClients(file);
      playSound("action");
      setImportResult(result);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Une entrée par client : la liste des champs qui correspondent, ou null s'il est écarté.
  const correspondances = useMemo(
    () => new Map(clients.map((c) => [c.id, matchedFields(c, query)])),
    [clients, query]
  );
  const nbVisibles = useMemo(() => [...correspondances.values()].filter((v) => v !== null).length, [correspondances]);

  return (
    <div>
      <div className="row">
        <h1>Clients</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn outline" disabled={exporting} onClick={() => exportAs("pdf")}>Exporter PDF</button>
          <button className="btn outline" disabled={exporting} onClick={() => exportAs("xlsx")}>Exporter Excel</button>
          <button className="btn outline" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            {importing ? "Import en cours…" : "Importer (.xlsx / .csv)"}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.csv" style={{ display: "none" }} onChange={(e) => importFile(e.target.files[0])} />
          <button className="btn" onClick={() => setShowAdd(true)}>Nouveau client</button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <input
          className="input"
          style={{ flex: 1, marginBottom: 0 }}
          placeholder="Rechercher : nom, téléphone, courriel, adresse…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && <button className="btn outline" onClick={() => setQuery("")}>✕</button>}
      </div>
      <div style={{ color: "#8b99b5", fontSize: 13, marginBottom: 14 }}>
        {query.trim() ? `${nbVisibles} client(s) trouvé(s) sur ${clients.length}` : `${clients.length} client(s)`}
        {query.trim() ? ` · les exports PDF et Excel contiennent toute la base, pas le résultat de la recherche` : ""}
      </div>

      {erreurListe && (
        <div className="card" role="alert" style={{ color: "#e85d4c", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ flex: 1 }}>{erreurListe}</span>
          <button className="btn outline" onClick={load}>Réessayer</button>
        </div>
      )}
      {clients.map((c) => {
        const m = correspondances.get(c.id);
        return <ClientCard key={c.id} client={c} onDelete={remove} onEdit={openEdit} onConfirmEmail={confirmerCourriel} onResetPassword={reinitialiser} masque={m === null} trouvePar={m} />;
      })}

      {clients.length > 0 && nbVisibles === 0 && (
        <div style={{ color: "#8b99b5", fontSize: 14 }}>
          Aucun client ne correspond à « {query} ».{" "}
          <button className="btn outline" style={{ marginLeft: 8 }} onClick={() => setQuery("")}>Effacer la recherche</button>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Modifier le client</h3><button onClick={() => setEditing(null)}>✕</button></div>
            <label>Nom complet</label>
            <input className="input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Courriel</label>
            <input className="input" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="(aucun)" />
            <label style={{ display: "block", marginTop: 8 }}>Téléphone</label>
            <input className="input" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            <AddressInput
              label="Adresse (domicile — prise en charge par défaut)"
              value={editForm.address}
              onChange={({ address }) => setEditForm({ ...editForm, address })}
            />
            <label style={{ display: "block", marginTop: 8 }}>Mémo et préférences</label>
            <textarea className="input" style={{ minHeight: 60, fontFamily: "inherit" }} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            <ChampsTarifs form={editForm} setForm={setEditForm} />
            {editError && <div style={{ color: "#e85d4c", fontSize: 13, marginTop: 8 }}>{editError}</div>}
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={saveEdit}>Enregistrer les modifications</button>
          </div>
        </div>
      )}
      {clients.length === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucun client pour l'instant.</div>}

      {showAdd && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Nouveau client</h3><button onClick={() => setShowAdd(false)}>✕</button></div>
            <label>Nom complet</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Courriel (optionnel)</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Téléphone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+15145551234" />
            <AddressInput
              label="Adresse (optionnel)"
              value={form.address}
              onChange={({ address }) => setForm({ ...form, address })}
              placeholder="ex. 12 Rue Bourgogne, Chambly, QC"
            />
            <label style={{ display: "block", marginTop: 8 }}>Préférences ou mémo (optionnel)</label>
            <textarea className="input" style={{ minHeight: 60, fontFamily: "inherit" }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <ChampsTarifs form={form} setForm={setForm} />
            {error && <div style={{ color: "#e85d4c", fontSize: 13, marginTop: 8 }}>{error}</div>}
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={createClient}>Créer le client</button>
          </div>
        </div>
      )}

      {importResult && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Résultat de l'import</h3><button onClick={() => setImportResult(null)}>✕</button></div>
            <div className="field-row"><span className="field-label">Clients créés :</span><span>{importResult.createdCount}</span></div>
            <div className="field-row"><span className="field-label">Lignes ignorées :</span><span>{importResult.skippedCount}</span></div>
            {/* Mots de passe temporaires des comptes créés, montrés ici une seule fois (B05). */}
            {importResult.created?.length > 0 && (
              <>
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--amber)" }}>
                  Mots de passe temporaires, montrés une seule fois : copiez-les maintenant pour les transmettre.
                </div>
                <div style={{ marginTop: 6, maxHeight: 200, overflowY: "auto", fontSize: 12 }}>
                  {importResult.created.map((c) => (
                    <div key={c.id} className="field-row"><span className="field-label">{c.name}{c.phone ? ` · ${c.phone}` : ""}</span><span style={{ fontFamily: "monospace" }}>{c.tempPassword}</span></div>
                  ))}
                </div>
                <button className="btn outline" style={{ marginTop: 8, width: "100%" }} onClick={() => navigator.clipboard?.writeText(importResult.created.map((c) => `${c.name}\t${c.phone || ""}\t${c.email || ""}\t${c.tempPassword}`).join("\n"))}>
                  Copier la liste (nom, téléphone, courriel, mot de passe)
                </button>
              </>
            )}
            {importResult.skipped?.length > 0 && (
              <div style={{ marginTop: 10, maxHeight: 200, overflowY: "auto", fontSize: 12, color: "var(--muted)" }}>
                {importResult.skipped.map((s, i) => (
                  <div key={i} style={{ marginBottom: 4 }}>{s.row?._ligne ? `Ligne ${s.row._ligne} : ` : ""}{s.row?.nom || s.row?.name || "(ligne sans nom)"} — {s.reason}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {credentials && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Accès générés</h3><button onClick={() => setCredentials(null)}>✕</button></div>
            <div className="field-row"><span className="field-label">Mot de passe temporaire :</span><span>{credentials}</span></div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
              Transmettez-le au client — il pourra le changer une fois connecté.
            </div>
            <button className="btn outline" style={{ marginTop: 12, width: "100%" }} onClick={() => navigator.clipboard?.writeText(credentials)}>
              Copier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
