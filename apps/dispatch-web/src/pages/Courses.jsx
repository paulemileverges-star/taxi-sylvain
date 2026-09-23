import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { getSocket } from "../lib/socket.js";
import { playSound } from "../lib/sound.js";
import AddressInput from "../components/AddressInput.jsx";
import Suggest from "../components/Suggest.jsx";
import RideEditModal from "../components/RideEditModal.jsx";
import { STATUS_LABEL, statusClass, localInputToIso } from "../lib/status.js";
import { filtrerCourses, paginer, PERIODES } from "../lib/coursesFilter.js";
import { filterClients } from "../lib/clientSearch.js";

function fmtDate(d) {
  return new Date(d).toLocaleDateString("fr-CA");
}
function fmtTime(d) {
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Field({ label, value }) {
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}

const FILTRE_VIDE = { q: "", statut: "", periode: "all", driverId: "" };

export default function Courses() {
  const [rides, setRides] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [clients, setClients] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const EMPTY_FORM = {
    pickupAddress: "", pickupLat: null, pickupLng: null, pickupConfidence: null,
    destinationCode: "", // "" = autre adresse, sinon YUL / YHU / REM
    destAddress: "", destLat: null, destLng: null, destConfidence: null,
    fare: "", driverId: "", clientId: "", flightNumber: "", scheduledFor: "",
    clientName: "", clientPhone: "", clientEmail: "", clientAddress: "", clientNotes: "",
    newDriverName: "", newDriverEmail: "", newDriverPhone: "", newDriverCarModel: "", newDriverPlate: "",
  };
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState(null); // { clientTempPassword?, driverTempPassword? }
  const [destinations, setDestinations] = useState([]);
  const [quoteInfo, setQuoteInfo] = useState(null); // { price, zoneName } pour la destination choisie

  // Recherche, filtres et pagination (voir lib/coursesFilter.js) : la liste complète reste en
  // mémoire, seule la page affichée change. Un changement de filtre ramène à la première page.
  const [filtre, setFiltre] = useState(FILTRE_VIDE);
  const [page, setPage] = useState(1);
  // Fenêtre de modification complète (client, chauffeur, statut, adresses, heure, montant...).
  const [openRideId, setOpenRideId] = useState(null);
  const changerFiltre = (patch) => { setFiltre((f) => ({ ...f, ...patch })); setPage(1); };
  const filtrees = useMemo(() => filtrerCourses(rides, filtre), [rides, filtre]);
  const pagination = paginer(filtrees, page);

  // Choix du client à la création d'une course (demande du propriétaire du 20 septembre au soir) :
  // la liste déroulante reste, et un champ au-dessus la filtre au fil de la frappe (nom, téléphone,
  // courriel, adresse, sans accents : même règle que la page Clients). Entrée choisit le premier.
  const [rechercheClient, setRechercheClient] = useState("");
  // La liste ne se déploie que pendant la frappe ; une fois le client choisi (clic ou Entrée), son
  // nom remplit le champ et la liste se referme (demande du propriétaire du 23 septembre).
  const [listeClientsOuverte, setListeClientsOuverte] = useState(false);
  const clientsFiltres = useMemo(() => filterClients(clients, rechercheClient), [clients, rechercheClient]);
  const clientChoisi = clients.find((c) => c.id === form.clientId);
  const choisirClient = (clientId) => {
    selectClient(clientId);
    const client = clients.find((c) => c.id === clientId);
    if (client) setRechercheClient(client.name);
    else if (clientId !== "__new__") setRechercheClient("");
    setListeClientsOuverte(false);
  };
  const choisirPremierClient = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (clientsFiltres.length > 0) choisirClient(clientsFiltres[0].id);
  };

  useEffect(() => { api.listDestinations().then(setDestinations).catch(() => setDestinations([])); }, []);

  // Tarif du catalogue : dès qu'une destination prédéfinie et une adresse de départ sont connues,
  // le montant est proposé (modifiable) et la municipalité reconnue est affichée.
  useEffect(() => {
    if (!showCreate || !form.destinationCode || form.pickupAddress.trim().length < 3) { setQuoteInfo(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const q = await api.priceQuote(form.pickupAddress, form.destinationCode, form.clientId || null);
        if (cancelled) return;
        setQuoteInfo(q);
        if (q.price != null) setForm((f) => ({ ...f, fare: String(q.price) }));
      } catch {
        if (!cancelled) setQuoteInfo(null);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [showCreate, form.destinationCode, form.pickupAddress, form.clientId]);

  // Adresse de prise en charge par défaut = domicile du client choisi (modifiable).
  const selectClient = async (clientId) => {
    const client = clients.find((c) => c.id === clientId);
    const next = { ...form, clientId };
    if (client?.address && !form.pickupAddress.trim()) {
      next.pickupAddress = client.address;
      next.pickupLat = null;
      next.pickupLng = null;
      setForm(next);
      try {
        const results = await api.geocodeSearch(client.address);
        if (results?.[0]) setForm((f) => (f.pickupAddress === client.address ? { ...f, pickupLat: results[0].lat, pickupLng: results[0].lng } : f));
      } catch { /* sans coordonnées, la distance ne sera simplement pas calculée */ }
      return;
    }
    setForm(next);
  };

  const selectDestination = (code) => {
    const preset = destinations.find((d) => d.code === code);
    setForm((f) => ({
      ...f,
      destinationCode: code,
      destAddress: preset ? preset.address : "",
      destLat: preset?.lat ?? null,
      destLng: preset?.lng ?? null,
      fare: preset ? "" : f.fare,
    }));
    setQuoteInfo(null);
  };

  const load = async () => {
    const [r, d, c] = await Promise.all([api.listRides(), api.listDrivers(), api.listClients()]);
    setRides(r);
    setDrivers(d);
    setClients(c);
  };

  useEffect(() => { load(); }, []);

  // Les statuts changent en direct (chauffeur en route, course prise, terminée...) sans
  // rafraîchir la page.
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => load();
    socket.on("ride:created", refresh);
    socket.on("ride:updated", refresh);
    socket.on("ride:refused", refresh);
    return () => {
      socket.off("ride:created", refresh);
      socket.off("ride:updated", refresh);
      socket.off("ride:refused", refresh);
    };
  }, []);

  const create = async () => {
    setError("");
    try {
      const ride = await api.createRide({
        pickupAddress: form.pickupAddress,
        pickupLat: form.pickupLat ?? undefined,
        pickupLng: form.pickupLng ?? undefined,
        pickupConfidence: form.pickupConfidence ?? undefined,
        destConfidence: form.destConfidence ?? undefined,
        destinationCode: form.destinationCode || undefined,
        destAddress: form.destAddress,
        destLat: form.destLat ?? undefined,
        destLng: form.destLng ?? undefined,
        fare: Number(form.fare),
        scheduledFor: localInputToIso(form.scheduledFor) || undefined,
        driverId: form.driverId && !["__new__", "__broadcast__"].includes(form.driverId) ? form.driverId : undefined,
        broadcastAll: form.driverId === "__broadcast__" || undefined,
        newDriver: form.driverId === "__new__" ? {
          name: form.newDriverName, email: form.newDriverEmail, phone: form.newDriverPhone,
          carModel: form.newDriverCarModel || undefined, plate: form.newDriverPlate || undefined,
        } : undefined,
        clientId: form.clientId && form.clientId !== "__new__" ? form.clientId : undefined,
        clientName: form.clientId === "__new__" ? form.clientName : undefined,
        clientPhone: form.clientId === "__new__" ? form.clientPhone : undefined,
        clientEmail: form.clientId === "__new__" ? form.clientEmail || undefined : undefined,
        clientAddress: form.clientId === "__new__" ? form.clientAddress || undefined : undefined,
        clientNotes: form.clientId === "__new__" ? form.clientNotes || undefined : undefined,
        flightNumber: form.flightNumber || undefined,
      });
      setForm(EMPTY_FORM);
      setRechercheClient("");
      setShowCreate(false);
      playSound("action");
      load();
      if (ride.clientTempPassword || ride.driverTempPassword) {
        setCredentials({ client: ride.clientTempPassword, driver: ride.driverTempPassword });
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const assign = async (rideId, driverId) => {
    await api.assignDriver(rideId, driverId || null);
    playSound("action");
    load();
  };

  const broadcastToAll = async (rideId) => {
    await api.broadcastRide(rideId);
    playSound("action");
    load();
  };

  const remove = async (ride) => {
    if (!window.confirm("Supprimer cette course ? Cette action est définitive.")) return;
    await api.deleteRide(ride.id);
    playSound("action");
    load();
  };

  const filtreActif = filtre.q || filtre.statut || filtre.periode !== "all" || filtre.driverId;

  return (
    <div>
      <div className="row">
        <h1>Courses</h1>
        <button className="btn" onClick={() => setShowCreate(true)}>Nouvelle course</button>
      </div>

      <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 220, marginTop: 0 }}
          placeholder="Rechercher : client, chauffeur, adresse, numéro de vol…"
          value={filtre.q}
          onChange={(e) => changerFiltre({ q: e.target.value })}
        />
        <select className="input" style={{ width: 210, marginTop: 0 }} value={filtre.statut} onChange={(e) => changerFiltre({ statut: e.target.value })}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="input" style={{ width: 210, marginTop: 0 }} value={filtre.periode} onChange={(e) => changerFiltre({ periode: e.target.value })}>
          {PERIODES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <select className="input" style={{ width: 190, marginTop: 0 }} value={filtre.driverId} onChange={(e) => changerFiltre({ driverId: e.target.value })}>
          <option value="">Tous les chauffeurs</option>
          <option value="__none__">Non assignées</option>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {filtreActif && (
          <button type="button" className="btn outline" onClick={() => { setFiltre(FILTRE_VIDE); setPage(1); }}>Effacer les filtres</button>
        )}
      </div>
      <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 8 }}>
        {pagination.total} course{pagination.total > 1 ? "s" : ""}{filtreActif ? ` sur ${rides.length}` : ""} · page {pagination.page} / {pagination.pages}
      </div>

      {pagination.items.map((ride) => {
        const when = ride.scheduledFor || ride.createdAt;
        return (
          <div key={ride.id} className={`card ride-card ${statusClass(ride.status)}`}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className={`chip status-chip ${statusClass(ride.status)}`}>{STATUS_LABEL[ride.status] || ride.status}</span>
              <span style={{ color: "#f5a623", fontWeight: 700 }}>{ride.fare > 0 ? `${ride.fare.toFixed(2)} $` : "Montant à confirmer"}</span>
            </div>
            <Field label="Date de la course :" value={fmtDate(when)} />
            <Field label="Heure de la course :" value={fmtTime(when)} />
            <Field label="Nom du client :" value={ride.client?.name} />
            <Field label="Adresse de départ :" value={ride.pickupAddress} />
            <Field label="Destination :" value={ride.destAddress} />
            <Field label="Distance :" value={ride.distanceKm != null ? `${ride.distanceKm.toFixed(1)} km` : null} />
            <Field label="Numéro de vol :" value={ride.flightNumber} />
            <Field label="Montant prévu de la course :" value={ride.fare > 0 ? `${ride.fare.toFixed(2)} $` : "À confirmer"} />
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <select className="input" style={{ width: 180, marginTop: 0 }} value={ride.driverId || ""} onChange={(e) => assign(ride.id, e.target.value)}>
                <option value="">Non assigné</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => setOpenRideId(ride.id)}>Modifier</button>
                {ride.status === "REQUESTED" && (
                  <button className="btn outline" onClick={() => broadcastToAll(ride.id)}>Diffuser à tous</button>
                )}
                <button className="btn red" onClick={() => remove(ride)}>Supprimer</button>
              </div>
            </div>
          </div>
        );
      })}
      {rides.length === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucune course pour l'instant.</div>}
      {rides.length > 0 && pagination.total === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucune course ne correspond à ces filtres.</div>}

      {pagination.pages > 1 && (
        <div className="row" style={{ justifyContent: "center", gap: 12, marginTop: 12 }}>
          <button className="btn outline" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)}>← Précédente</button>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>Page {pagination.page} / {pagination.pages}</span>
          <button className="btn outline" disabled={pagination.page >= pagination.pages} onClick={() => setPage(pagination.page + 1)}>Suivante →</button>
        </div>
      )}

      {showCreate && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Nouvelle course</h3><button onClick={() => setShowCreate(false)}>✕</button></div>
            <label style={{ display: "block" }}>Client (optionnel)</label>
            <input
              className="input"
              placeholder="Rechercher un client : nom, téléphone, courriel, adresse…"
              value={rechercheClient}
              onChange={(e) => { setRechercheClient(e.target.value); setListeClientsOuverte(true); }}
              onKeyDown={choisirPremierClient}
              autoComplete="off"
            />
            <select
              className="input"
              value={form.clientId}
              onChange={(e) => choisirClient(e.target.value)}
              size={listeClientsOuverte && rechercheClient.trim() ? Math.min(8, clientsFiltres.length + 2) : undefined}
            >
              <option value="">Non spécifié</option>
              {clientsFiltres.map((c) => <option key={c.id} value={c.id}>{c.name}{c.address ? ` — ${c.address}` : ""}</option>)}
              {/* Le client déjà choisi reste visible même si la recherche ne le retient plus. */}
              {clientChoisi && !clientsFiltres.some((c) => c.id === clientChoisi.id) && (
                <option value={clientChoisi.id}>{clientChoisi.name}{clientChoisi.address ? ` — ${clientChoisi.address}` : ""}</option>
              )}
              <option value="__new__">+ Nouveau client…</option>
            </select>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
              {listeClientsOuverte && rechercheClient.trim()
                ? `${clientsFiltres.length} client(s) trouvé(s) · Entrée choisit le premier`
                : `${clients.length} client(s) · tapez pour filtrer la liste`}
              {clientChoisi ? ` · choisi : ${clientChoisi.name}` : ""}
            </div>
            <div style={{ marginTop: 8 }}>
              <AddressInput
                label="Adresse de prise en charge (domicile du client par défaut)"
                value={form.pickupAddress}
                onChange={({ address, lat, lng, confidence }) => setForm({ ...form, pickupAddress: address, pickupLat: lat, pickupLng: lng, pickupConfidence: confidence || null })}
              />
            </div>
            <label style={{ display: "block", marginTop: 8 }}>Destination</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {[...destinations.map((d) => ({ code: d.code, label: d.code })), { code: "", label: "Autre adresse" }].map((opt) => (
                <button
                  key={opt.code || "other"}
                  type="button"
                  className={`btn ${form.destinationCode === opt.code ? "" : "outline"}`}
                  onClick={() => selectDestination(opt.code)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {form.destinationCode ? (
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
                {destinations.find((d) => d.code === form.destinationCode)?.label} — {form.destAddress}
              </div>
            ) : (
              <AddressInput
                label="Adresse de destination"
                value={form.destAddress}
                onChange={({ address, lat, lng, confidence }) => setForm({ ...form, destAddress: address, destLat: lat, destLng: lng, destConfidence: confidence || null })}
              />
            )}
            <Suggest
              field="flight"
              label="Numéro de vol (optionnel)"
              value={form.flightNumber}
              onChange={(v) => setForm({ ...form, flightNumber: v })}
              placeholder="ex. AC1234"
              style={{ marginTop: 8 }}
            />
            <label style={{ display: "block", marginTop: 8 }}>Heure de prise en charge du client (optionnel)</label>
            <input className="input" type="datetime-local" value={form.scheduledFor} onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Montant prévu ($)</label>
            <input className="input" value={form.fare} onChange={(e) => setForm({ ...form, fare: e.target.value })} />
            {form.destinationCode && (
              <div style={{ fontSize: 12, marginTop: 4, color: quoteInfo?.price != null ? "#3fa796" : "var(--muted)" }}>
                {quoteInfo?.price != null
                  ? quoteInfo.source === "client"
                    // Un prix négocié s'applique partout, même loin du domicile : on montre la
                    // différence avec la grille pour que personne ne facture sans le voir.
                    ? `Prix négocié de ce client : ${quoteInfo.price.toFixed(2)} $${quoteInfo.zonePrice != null ? ` (grille ${quoteInfo.zoneName || form.destinationCode} : ${quoteInfo.zonePrice.toFixed(2)} $)` : ""} — modifiable.`
                    : `Tarif catalogue appliqué : ${quoteInfo.price.toFixed(2)} $ (${quoteInfo.zoneName || form.destinationCode}) — modifiable.`
                  : form.pickupAddress.trim().length >= 3
                    ? "Municipalité non reconnue dans la grille (voir Tarifs) — indiquez le montant."
                    : "Le tarif du catalogue s'affichera dès que l'adresse de prise en charge est saisie."}
              </div>
            )}
            {form.clientId === "__new__" && (
              <>
                <Suggest
                  field="client"
                  label="Nom du nouveau client"
                  value={form.clientName}
                  onChange={(v) => setForm({ ...form, clientName: v })}
                  onSelect={(item) => setForm((f) => ({
                    ...f,
                    clientId: item.data.id, // client déjà connu : on l'utilise au lieu d'en créer un doublon
                    clientName: item.data.name,
                    clientPhone: item.data.phone || "",
                    clientEmail: item.data.email || "",
                    clientAddress: item.data.address || "",
                    pickupAddress: f.pickupAddress || item.data.address || "",
                  }))}
                  placeholder="Commencez à taper : les clients connus s'affichent"
                  style={{ marginTop: 8 }}
                />
                <Suggest
                  field="client"
                  label="Téléphone du nouveau client"
                  value={form.clientPhone}
                  onChange={(v) => setForm({ ...form, clientPhone: v })}
                  onSelect={(item) => setForm((f) => ({
                    ...f,
                    clientId: item.data.id,
                    clientName: item.data.name,
                    clientPhone: item.data.phone || "",
                    clientEmail: item.data.email || "",
                    clientAddress: item.data.address || "",
                  }))}
                  placeholder="+15145551234"
                  style={{ marginTop: 8 }}
                />
                <label style={{ display: "block", marginTop: 8 }}>Courriel du nouveau client (optionnel)</label>
                <input className="input" type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                  Avec un courriel, le client recevra un code de confirmation à sa première connexion (et les courriels de course).
                </div>
                <label style={{ display: "block", marginTop: 8 }}>Adresse du nouveau client (domicile — par défaut, l'adresse de prise en charge)</label>
                <AddressInput
                  value={form.clientAddress}
                  onChange={({ address }) => setForm({ ...form, clientAddress: address })}
                  placeholder={form.pickupAddress || "ex. 12 Rue Bourgogne, Chambly, QC"}
                />
                <label style={{ display: "block", marginTop: 8 }}>Préférences ou mémo (optionnel)</label>
                <textarea className="input" style={{ minHeight: 60, fontFamily: "inherit" }} value={form.clientNotes} onChange={(e) => setForm({ ...form, clientNotes: e.target.value })} />
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                  Un compte client sera créé automatiquement (ou réutilisé si ce numéro existe déjà) avec des accès générés automatiquement.
                </div>
              </>
            )}
            <label style={{ display: "block", marginTop: 8 }}>Affecter à un chauffeur</label>
            <select className="input" value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
              <option value="">Non assigné</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              <option value="__new__">+ Nouveau chauffeur…</option>
              <option value="__broadcast__">📢 Diffuser à tous les chauffeurs</option>
            </select>
            {form.driverId === "__new__" && (
              <>
                <Suggest
                  field="driver"
                  label="Nom du nouveau chauffeur"
                  value={form.newDriverName}
                  onChange={(v) => setForm({ ...form, newDriverName: v })}
                  onSelect={(item) => setForm((f) => ({ ...f, driverId: item.data.id }))} // chauffeur déjà connu : on l'affecte directement
                  placeholder="Commencez à taper : les chauffeurs connus s'affichent"
                  style={{ marginTop: 8 }}
                />
                <label style={{ display: "block", marginTop: 8 }}>Courriel du nouveau chauffeur</label>
                <input className="input" type="email" value={form.newDriverEmail} onChange={(e) => setForm({ ...form, newDriverEmail: e.target.value })} />
                <label style={{ display: "block", marginTop: 8 }}>Téléphone du nouveau chauffeur</label>
                <input className="input" value={form.newDriverPhone} onChange={(e) => setForm({ ...form, newDriverPhone: e.target.value })} placeholder="+15145551234" />
                <label style={{ display: "block", marginTop: 8 }}>Véhicule (optionnel)</label>
                <input className="input" value={form.newDriverCarModel} onChange={(e) => setForm({ ...form, newDriverCarModel: e.target.value })} placeholder="ex. Toyota Camry 2021" />
                <label style={{ display: "block", marginTop: 8 }}>Plaque (optionnel)</label>
                <input className="input" value={form.newDriverPlate} onChange={(e) => setForm({ ...form, newDriverPlate: e.target.value })} />
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                  Un compte chauffeur sera créé automatiquement avec des accès générés automatiquement, et affecté à cette course. Il recevra un code de confirmation par courriel à sa première connexion.
                </div>
              </>
            )}
            {form.driverId === "__broadcast__" && (
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                Dès la création, la course sera notifiée en temps réel à tous les chauffeurs. Le premier à l'accepter l'obtient.
              </div>
            )}
            {error && <div style={{ color: "#e85d4c", fontSize: 13, marginTop: 8 }}>{error}</div>}
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={create}>Créer la course</button>
          </div>
        </div>
      )}

      {openRideId && <RideEditModal rideId={openRideId} onClose={() => setOpenRideId(null)} onSaved={load} />}

      {credentials && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Accès générés automatiquement</h3><button onClick={() => setCredentials(null)}>✕</button></div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
              Copiez ces mots de passe temporaires et transmettez-les aux concernés — ils pourront les changer eux-mêmes une fois connectés.
              À la première connexion, un code de confirmation leur est envoyé par courriel.
            </div>
            {credentials.client && (
              <div className="field-row"><span className="field-label">Client — mot de passe :</span><span>{credentials.client}</span></div>
            )}
            {credentials.driver && (
              <div className="field-row"><span className="field-label">Chauffeur — mot de passe :</span><span>{credentials.driver}</span></div>
            )}
            <button
              className="btn outline"
              style={{ marginTop: 12, width: "100%" }}
              onClick={() => {
                navigator.clipboard?.writeText(
                  [credentials.client && `Client : ${credentials.client}`, credentials.driver && `Chauffeur : ${credentials.driver}`]
                    .filter(Boolean).join("\n")
                );
              }}
            >
              Copier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
