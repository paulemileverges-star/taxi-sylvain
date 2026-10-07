import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, requirePermission } from "../middleware/auth.js";
import { quotaParCompte } from "../middleware/rateLimit.js";
import { isConfigured as isCallMaskingConfigured, getOrCreateCallSession, callAllowedForStatus, fermerSessionAppel } from "../lib/twilioProxy.js";
import { notifyUser, notifyAllDrivers } from "../lib/push.js";
import { createDriverAccount } from "./drivers.js";
import { generateTempPassword, realEmailOrNull } from "../lib/placeholderEmail.js";
import { computeDistanceKm, geocodeAddress } from "../lib/distance.js";
import { clearDriverLocation, getDriverLocation } from "../lib/driverLocations.js";
import { quote } from "../lib/pricing.js";
import { sendRideConfirmation, sendRideCancellation, loadRideForEmail } from "../lib/rideEmails.js";
import { pageDeCourses, ordreAccueil } from "../lib/ridesOrder.js";
import { normaliserAdresse, chargerZones } from "../lib/rideAddresses.js";
import { oublierRappels } from "../jobs/rideReminders.js";
import { changementDeStatut, texteChangementDeStatut } from "../lib/rideEdit.js";
import { chauffeurPeutContacter, chauffeurPeutPartir, ouvertureContact, ouvertureDepart, quandLisible } from "../lib/fenetres.js";
import { normaliserArrets, ArretsInvalides, trajetCourt, arretsDe } from "../lib/arrets.js";
import { AUDIENCES, aPermission, emettreEquipe, estEquipe } from "../lib/equipe.js";
import {
  champsReservationClient, heureDePriseEnCharge, montantCourse, distanceSaisie, adresseValide, numeroDeVol, latitude, longitude,
} from "../lib/validationCourse.js";
import { unSeulTraitement } from "../lib/idempotence.js";
import { FIL_DE_COURSE } from "./messages.js";

// « · Toyota Camry · gris · T45 KLM » : ce que le client doit reconnaître dans la rue.
function vehiculeTexte(d) {
  return [d?.carModel, d?.carColor, d?.plate].filter(Boolean).map((x) => ` · ${x}`).join("");
}

// Réservation par téléphone (besoin #5) : le Dispatch peut créer une course pour un client sans
// compte — on retrouve son compte existant par téléphone, ou on lui en crée un à la volée. Si le
// client est réellement créé (pas seulement retrouvé), un mot de passe temporaire est renvoyé en
// clair pour que le Dispatch puisse le transmettre.
async function findOrCreateClientByPhone(name, phone, email, address, notes) {
  const existing = await prisma.user.findFirst({ where: { role: "CLIENT", phone } });
  if (existing) return { id: existing.id, tempPassword: null };

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const finalEmail = email || `client-${crypto.randomBytes(6).toString("hex")}@reservation.taxisylvain.local`;
  const created = await prisma.user.create({
    data: {
      role: "CLIENT", name, phone, email: finalEmail, address: address || null, notes: notes || null, passwordHash,
      // Un vrai courriel sera confirmé par code à la première connexion (lib/verification.js).
      emailVerifiedAt: realEmailOrNull(finalEmail) ? null : new Date(),
    },
  });
  return { id: created.id, tempPassword };
}

const router = Router();
router.use(requireAuth);

const TERMINAL_STATUSES = ["COMPLETED", "CANCELLED", "REFUSED"];
const RIDE_INCLUDE = {
  driver: { select: { id: true, name: true, carModel: true, carColor: true, plate: true, ratingAvg: true, photoUrl: true, carPhotoUrl: true } },
  client: { select: { id: true, name: true } },
};

// L'équipe ne lit les courses que si elle y est autorisée : page Courses ou Cédule (audit du
// 7 octobre 2026, SEC-02 : avant, tout compte ADMIN lisait toutes les courses, même sans droit).
const equipeSansAccesCourses = (user) => estEquipe(user) && !aPermission(user, ...AUDIENCES.courses);
const REFUS_COURSES = { error: "Accès refusé : cette fonctionnalité n'est pas autorisée pour votre compte." };

// Réservations faites par un client dans son application : 20 par heure au plus (SEC-14).
const quotaReservationsClient = quotaParCompte("reservations", { windowMs: 60 * 60 * 1000, max: 20 });
const limiterReservationsClient = (req, res, next) => (req.user.role === "CLIENT" ? quotaReservationsClient(req, res, next) : next());

// Liste des courses — filtrée selon le rôle. Sans "when", renvoie tout (comportement historique,
// utilisé par l'écran d'accueil). Avec "when=upcoming|past", pagine par lot de 10 (besoin #4).
router.get("/", async (req, res) => {
  const { role, id } = req.user;
  if (equipeSansAccesCourses(req.user)) return res.status(403).json(REFUS_COURSES);
  let where = {};
  if (role === "CLIENT") where = { clientId: id };
  if (role === "DRIVER") where = { OR: [{ driverId: id }, { status: "BROADCAST", NOT: { refusedBy: { has: id } } }] };
  // L'équipe autorisée voit tout

  const { when, page = "1", pageSize = "10" } = req.query;
  if (when === "past") where = { ...where, status: { in: TERMINAL_STATUSES } };
  else if (when === "upcoming") where = { ...where, status: { notIn: TERMINAL_STATUSES } };

  if (when) {
    // Le classement suit « heure de prise en charge, sinon heure de création », que PostgreSQL ne
    // sait pas exprimer dans un orderBy : il se fait donc en mémoire. Pour ne pas charger tout
    // l'historique avec ses relations à chaque page, on ne lit d'abord que les dates, puis on ne
    // recharge en détail que les courses de la page demandée.
    // Le orderBy reste indispensable : sans ORDER BY, PostgreSQL peut renvoyer les lignes dans un
    // ordre différent d'une requête à l'autre, et une course changerait de page entre deux pages.
    const legeres = await prisma.ride.findMany({ where, select: { id: true, scheduledFor: true, createdAt: true }, orderBy: { id: "asc" } });
    const { rides: refs, total, page: numero, pageSize: taille } = pageDeCourses(legeres, { when, page, pageSize });
    const completes = await prisma.ride.findMany({ where: { id: { in: refs.map((r) => r.id) } }, include: RIDE_INCLUDE });
    const parId = new Map(completes.map((r) => [r.id, r]));
    // RIDE_INCLUDE est la seule protection des données personnelles sur cette route : on recompose
    // donc chaque course à partir de SON résultat, jamais à partir de la requête légère.
    const rides = refs.filter((r) => parId.has(r.id)).map((r) => ({ ...parId.get(r.id), dayKey: r.dayKey, dayLabel: r.dayLabel }));
    return res.json({ rides, total, page: numero, pageSize: taille });
  }

  const rides = await prisma.ride.findMany({ where, orderBy: { createdAt: "desc" }, include: RIDE_INCLUDE });
  // Accueil des applications : les courses à prendre en premier, puis celles à faire par heure de
  // prise en charge, puis l’historique (voir lib/ridesOrder.js). La console garde l’ordre de saisie.
  res.json(estEquipe(req.user) ? rides : ordreAccueil(rides));
});

router.get("/:id", async (req, res) => {
  const ride = await prisma.ride.findUnique({
    where: { id: req.params.id },
    // Seule la discussion client <-> chauffeur, jamais le fil interne Taxi Sylvain <-> chauffeur
    // rattaché à la course (audit du 7 octobre 2026, SEC-01).
    include: { driver: true, client: true, messages: { where: FIL_DE_COURSE, orderBy: { createdAt: "asc" } }, ratings: true },
  });
  if (!ride) return res.status(404).json({ error: "Course introuvable." });
  const isStaff = estEquipe(req.user) && aPermission(req.user, ...AUDIENCES.courses);
  const isParty = req.user.id === ride.clientId || req.user.id === ride.driverId;
  const isOpenOffer = req.user.role === "DRIVER" && ride.status === "BROADCAST";
  if (!isStaff && !isParty && !isOpenOffer) return res.status(403).json({ error: "Accès refusé." });
  const out = sanitizeRide(ride, req.user);
  // Un chauffeur qui regarde une offre ouverte n'en est pas (encore) le chauffeur : il voit le trajet
  // pour décider, pas la discussion ni les notes de la course.
  if (!isStaff && !isParty) {
    out.messages = [];
    out.ratings = [];
  }
  res.json(out);
});

// Créer une course (Dispatch ou Client)
router.post("/", requirePermission("courses", "CLIENT"), limiterReservationsClient, async (req, res) => {
  const isClientBooking = req.user.role === "CLIENT";
  // Un client n'envoie que les champs d'une réservation (liste blanche, voir lib/validationCourse.js).
  const corps = isClientBooking ? champsReservationClient(req.body) : (req.body || {});
  const {
    pickupAddress, scheduledFor, flightNumber, destinationCode,
    clientName, clientPhone, clientEmail, clientAddress, clientNotes,
    pickupConfidence, destConfidence: destConfidenceRecue, broadcastAll,
    newDriver, // { name, email, phone, password?, carModel?, plate? } — créé à la volée et affecté
  } = corps;
  let { driverId, destAddress } = corps;
  const pickupLat = latitude(corps.pickupLat);
  const pickupLng = longitude(corps.pickupLng);
  let destLat = latitude(corps.destLat);
  let destLng = longitude(corps.destLng);

  // Contrôles de forme, les mêmes qu'à la modification (audit du 7 octobre 2026, B13).
  if (!adresseValide(pickupAddress)) return res.status(400).json({ error: "Adresse de prise en charge, destination et montant requis." });
  if (destAddress !== undefined && destAddress !== null && destAddress !== "" && !adresseValide(destAddress)) {
    return res.status(400).json({ error: "Destination invalide." });
  }
  const heure = heureDePriseEnCharge(scheduledFor);
  if (heure.erreur) return res.status(400).json({ error: heure.erreur });
  let distanceManuelle = null;
  if (!isClientBooking && corps.distanceKm !== undefined && corps.distanceKm !== null && corps.distanceKm !== "") {
    distanceManuelle = distanceSaisie(corps.distanceKm);
    if (distanceManuelle === null) return res.status(400).json({ error: "Distance invalide." });
  }
  // Montant saisi par l'équipe : nombre fini positif. Un client n'envoie jamais de montant.
  let fare = null;
  const montantRecu = !isClientBooking && corps.fare !== undefined && corps.fare !== null && corps.fare !== "";
  if (montantRecu) {
    fare = montantCourse(corps.fare);
    if (fare === null) return res.status(400).json({ error: "Montant invalide." });
  }

  // Client et chauffeur désignés par l'équipe : de vrais comptes, du bon rôle.
  const isStaff = estEquipe(req.user);
  let clientId = isClientBooking ? req.user.id : corps.clientId ?? null;
  if (!isClientBooking && clientId) {
    const c = await prisma.user.findUnique({ where: { id: String(clientId) }, select: { role: true } });
    if (!c || c.role !== "CLIENT") return res.status(400).json({ error: "Client introuvable." });
  }
  if (broadcastAll) driverId = null; // une course diffusée n'a pas encore de chauffeur
  if (driverId) {
    const d = await prisma.user.findUnique({ where: { id: String(driverId) }, select: { role: true } });
    if (!d || d.role !== "DRIVER") return res.status(400).json({ error: "Chauffeur introuvable." });
  }

  // Destination prédéfinie (YUL, YHU, REM...) : adresse, coordonnées et tarif du catalogue selon
  // la municipalité de prise en charge. Le tarif du catalogue s'impose au client ; le Dispatch
  // peut le surcharger en saisissant un montant.
  // Qui est le client ? Résolu ICI, en lecture seule, car son prix négocié l'emporte sur la grille.
  // La création d'un compte client, elle, reste plus bas : la remonter fabriquerait un compte
  // fantôme à chaque formulaire refusé.
  let quoteClientId = clientId;
  if (!quoteClientId && isStaff && clientPhone) {
    const connu = await prisma.user.findFirst({ where: { role: "CLIENT", phone: String(clientPhone) }, select: { id: true } });
    quoteClientId = connu?.id ?? null;
  }

  // Adresses mises à la forme unique AVANT le calcul du tarif : c'est ce texte qui sera enregistré,
  // affiché partout et ouvert dans Waze. La mise en forme ne peut jamais changer la municipalité
  // reconnue (garde-fou dans addressFormat.js) : aucun prix ne bouge en silence.
  const zones = await chargerZones();
  const depart = await normaliserAdresse(pickupAddress, { zones, coords: { lat: pickupLat, lng: pickupLng, confidence: pickupConfidence } });
  let pickupAddressFinale = depart.address || pickupAddress;
  let pickup = depart.coords || { lat: pickupLat, lng: pickupLng };
  let precisionDepart = depart.confidence || null;
  let precisionArrivee = destConfidenceRecue || null;
  const avertissements = depart.avertissement && depart.avertissement !== "adresse-vide" ? [depart.avertissement] : [];

  let destPlaceId = typeof corps.destPlaceId === "string" ? corps.destPlaceId.slice(0, 300) : null;
  if (destinationCode) {
    const q = await quote({ pickupAddress: pickupAddressFinale, destinationCode: String(destinationCode), clientId: quoteClientId });
    // Un code inconnu est refusé, comme à la modification : avant le 7 octobre, il laissait passer le
    // montant envoyé par l'application (même négatif) faute de tarif du catalogue (SEC-06).
    if (!q.destination) return res.status(400).json({ error: "Destination du catalogue inconnue." });
    destAddress = q.destination.address;
    destLat = q.destination.lat;
    destLng = q.destination.lng;
    destPlaceId = null;
    // Seuls les points du catalogue contrôlés (YUL Arrivées, P4, REM) lancent un guidage direct ;
    // un point non vérifié (l'ancien point de YHU était le centre des pistes) guide par le texte.
    precisionArrivee = q.destination.pointVerified ? "verifie" : "rue";
    // Le tarif du catalogue s'impose au client ; l'équipe peut le remplacer par un montant saisi.
    if (isClientBooking || fare === null) fare = q.price ?? 0;
  } else if (destAddress) {
    const arrivee = await normaliserAdresse(destAddress, { zones, coords: { lat: destLat, lng: destLng, confidence: destConfidenceRecue } });
    if (arrivee.address) destAddress = arrivee.address;
    if (arrivee.coords) { destLat = arrivee.coords.lat; destLng = arrivee.coords.lng; }
    precisionArrivee = arrivee.confidence || precisionArrivee;
    // Identifiant Google : celui du lieu choisi dans la liste, sinon celui trouvé par le géocodage.
    destPlaceId = destPlaceId || arrivee.placeId || null;
  }

  // Arrêts entre la prise en charge et la destination (6 octobre 2026), dans l'ordre saisi.
  let arrets = [];
  try {
    arrets = await normaliserArrets(corps.stops, { zones });
  } catch (e) {
    if (e instanceof ArretsInvalides) return res.status(400).json({ error: e.message });
    throw e;
  }
  const pickupPlaceId = typeof corps.pickupPlaceId === "string" ? corps.pickupPlaceId.slice(0, 300) : depart.placeId || null;

  // Messages en clair pour la console (6 octobre 2026) : une adresse que la carte ne trouve pas doit
  // être vérifiée avant le départ du chauffeur, sinon il risque d'être guidé au mauvais endroit.
  const messagesAdresse = [];
  if (depart.avertissement === "adresse-introuvable") messagesAdresse.push(`Adresse de départ introuvable sur la carte : « ${pickupAddressFinale} ». Vérifiez-la.`);
  if (!destinationCode && destAddress && typeof destLat !== "number") messagesAdresse.push(`Destination introuvable sur la carte : « ${destAddress} ». Vérifiez-la.`);
  arrets.forEach((a, i) => { if (typeof a.lat !== "number") messagesAdresse.push(`Arrêt ${i + 1} introuvable sur la carte : « ${a.address} ». Vérifiez-le.`); });

  // Un client qui réserve dans l'app ne connaît pas le tarif : sans destination au catalogue, le
  // montant reste à 0 (« à confirmer ») jusqu'à ce que Taxi Sylvain le fixe. Le Dispatch, lui,
  // doit toujours saisir un montant. Un montant envoyé par l'application d'un client n'est JAMAIS
  // retenu (la liste blanche l'écarte) : une vieille version envoyait 20 $ en dur.
  if (isClientBooking && !destinationCode) fare = 0;
  if (!pickupAddressFinale || !destAddress || (!fare && !isClientBooking)) {
    return res.status(400).json({ error: "Adresse de prise en charge, destination et montant requis." });
  }

  // Une même saisie envoyée deux fois (double clic, réseau lent) ne crée qu'une course (F05).
  const cle = req.get("Idempotency-Key") || corps.cleIdempotence;
  const { resultat, rejoue } = await unSeulTraitement(req.user.id, cle, async () => {
    let clientTempPassword = null;
    if (!clientId && isStaff && clientName && clientPhone) {
      // Nouveau client créé pendant la réservation : sans adresse de domicile explicite, on retient
      // l'adresse de prise en charge (c'est presque toujours chez lui) — les deux écrans concordent.
      const result = await findOrCreateClientByPhone(String(clientName), String(clientPhone), clientEmail, clientAddress || pickupAddressFinale, clientNotes);
      clientId = result.id;
      clientTempPassword = result.tempPassword;
    }

    let driverTempPassword = null;
    if (!driverId && !broadcastAll && isStaff && newDriver?.name && newDriver?.email && newDriver?.phone) {
      const { driver, tempPassword } = await createDriverAccount(newDriver);
      driverId = driver.id;
      driverTempPassword = tempPassword;
    }

    // Les coordonnées viennent de la mise en forme ci-dessus quand l'adresse a dû être géocodée.
    const dest = { lat: destLat, lng: destLng };
    const computedDistance = distanceManuelle !== null ? distanceManuelle : await computeDistanceKm(pickup, dest, arrets);

    const ride = await prisma.ride.create({
      data: {
        pickupAddress: pickupAddressFinale,
        destAddress,
        stops: arrets,
        pickupPlaceId,
        destPlaceId,
        pickupConfidence: precisionDepart,
        destConfidence: precisionArrivee,
        distanceKm: computedDistance,
        fare: fare ?? 0,
        flightNumber: numeroDeVol(flightNumber),
        scheduledFor: heure.date,
        clientId,
        driverId: driverId ?? null,
        // Un client ne peut ni s'affecter un chauffeur ni diffuser sa demande : elle attend Taxi Sylvain.
        status: isClientBooking ? "REQUESTED" : broadcastAll ? "BROADCAST" : driverId ? "ACCEPTED" : "REQUESTED",
        acceptedAt: !isClientBooking && driverId ? new Date() : null,
        pickupLat: typeof pickup.lat === "number" ? pickup.lat : null,
        pickupLng: typeof pickup.lng === "number" ? pickup.lng : null,
        destLat: typeof destLat === "number" ? destLat : null,
        destLng: typeof destLng === "number" ? destLng : null,
      },
      include: { client: { select: { id: true, name: true } } },
    });

    equipe(req, "ride:created", ride);
    if (isClientBooking) {
      // Le client est prévenu tout de suite si le tarif du catalogue s'est appliqué, sinon que sa
      // demande attend la validation (montant) de Taxi Sylvain.
      equipe(req, "ride:notification", {
        rideId: ride.id,
        status: ride.status,
        text: `${req.user.name} a réservé une course ${ride.pickupAddress} → ${ride.destAddress}${ride.fare > 0 ? ` (${ride.fare.toFixed(2)} $, tarif catalogue)` : " — montant à confirmer"}.`,
      });
    }
    if (ride.driverId) {
      broadcast(req, `driver:${ride.driverId}`, "ride:assigned", ride);
      notifyUser(ride.driverId, {
        title: "Nouvelle course assignée",
        body: trajetCourt(ride),
        data: { type: "ride:assigned", rideId: ride.id },
      });
      // Course confirmée dès sa création : courriel + invitation d'agenda au chauffeur et au client.
      sendRideConfirmation(ride.id);
    } else if (ride.status === "BROADCAST") {
      broadcast(req, "drivers", "ride:broadcast", ride);
      notifyAllDrivers({
        title: "Course de dernière minute",
        body: `${trajetCourt(ride)} — premier arrivé, premier servi`,
        data: { type: "ride:broadcast", rideId: ride.id },
      });
    }
    return { ...ride, clientTempPassword, driverTempPassword, avertissementsAdresse: avertissements, messagesAdresse };
  }).catch((e) => ({ resultat: { erreur: e } }));

  if (resultat?.erreur) {
    const e = resultat.erreur;
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }
  // « ville-non-reconnue » : la course est bien créée, mais aucun tarif du catalogue ne peut
  // s'appliquer. « zone-differente » : la mise en forme a été refusée pour ne pas changer le prix.
  res.status(rejoue ? 200 : 201).json(resultat);
});

// Affecter / réaffecter un chauffeur (Dispatch)
router.post("/:id/assign", requirePermission("courses"), async (req, res) => {
  const driverId = req.body?.driverId || null; // null pour retirer l'affectation
  const previous = await loadRideForEmail(req.params.id);
  if (!previous) return res.status(404).json({ error: "Course introuvable." });
  // Une course terminée ou annulée ne repart pas par « Affecter » : son statut serait écrasé (et elle
  // sortirait des rapports). La corriger passe par « Modifier », qui demande le statut voulu.
  if (TERMINAL_STATUSES.includes(previous.status)) {
    return res.status(409).json({ error: "Cette course est terminée ou annulée : modifiez-la pour changer son chauffeur." });
  }
  if (driverId) {
    const d = await prisma.user.findUnique({ where: { id: String(driverId) }, select: { role: true } });
    if (!d || d.role !== "DRIVER") return res.status(400).json({ error: "Chauffeur introuvable." });
  }
  const ride = await prisma.ride.update({
    where: { id: req.params.id },
    data: { driverId, status: driverId ? "ACCEPTED" : "REQUESTED", acceptedAt: driverId ? new Date() : null },
    include: { driver: { select: { name: true, carModel: true, carColor: true, plate: true } } },
  });

  // Changement de chauffeur : l'ancien voit la course disparaître de son agenda, le nouveau la
  // reçoit. Sans changement (réenregistrement du même chauffeur), on n'envoie rien.
  const driverChanged = previous.driverId !== driverId;
  if (driverChanged && previous.driverId) retirerChauffeur(req, previous, ride);
  if (driverChanged && driverId) sendRideConfirmation(ride.id);

  if (driverId) {
    broadcast(req, `driver:${driverId}`, "ride:assigned", ride);
    notifyUser(driverId, {
      title: "Nouvelle course assignée",
      body: trajetCourt(ride),
      data: { type: "ride:assigned", rideId: ride.id },
    });
    if (ride.clientId) {
      const charge = {
        title: "Votre chauffeur est confirmé",
        body: `${ride.driver.name}${vehiculeTexte(ride.driver)} — ${trajetCourt(ride)}`,
        data: { type: "ride:status", rideId: ride.id, status: ride.status },
      };
      notifyUser(ride.clientId, charge);
      signalerClient(req, ride.clientId, { rideId: ride.id, status: ride.status, ...charge });
    }
  }
  equipe(req, "ride:updated", ride);
  broadcast(req, `ride:${ride.id}`, "ride:status", ride);
  res.json(ride);
});

// Diffuser une course de dernière minute à tous les chauffeurs
router.post("/:id/broadcast", requirePermission("courses"), async (req, res) => {
  const before = await loadRideForEmail(req.params.id);
  if (!before) return res.status(404).json({ error: "Course introuvable." });
  if (TERMINAL_STATUSES.includes(before.status)) {
    return res.status(409).json({ error: "Cette course est terminée ou annulée : elle ne peut pas être diffusée." });
  }
  const ride = await prisma.ride.update({
    where: { id: req.params.id },
    data: { status: "BROADCAST", driverId: null, acceptedAt: null },
  });
  // Rediffusion d'une course déjà affectée (audit du 7 octobre 2026, B14) : l'ancien chauffeur est
  // prévenu, la course sort de son agenda et de son suivi, comme lors d'une réaffectation.
  if (before.driverId) retirerChauffeur(req, before, ride);
  equipe(req, "ride:updated", ride);
  broadcast(req, `ride:${ride.id}`, "ride:status", ride);
  broadcast(req, "drivers", "ride:broadcast", ride);
  notifyAllDrivers({
    title: "Course de dernière minute",
    body: `${trajetCourt(ride)} — premier arrivé, premier servi`,
    data: { type: "ride:broadcast", rideId: ride.id },
  });
  res.json(ride);
});

// Un chauffeur accepte une course diffusée — le premier arrivé l'obtient.
// Audit du 7 octobre 2026 (CONC-01) : lire le statut puis écrire laissait deux chauffeurs simultanés
// « gagner » tous les deux. La prise est désormais UNE écriture conditionnelle : la base ne modifie la
// course que si elle est encore diffusée et sans chauffeur ; le perdant reçoit 409, et seul le
// gagnant déclenche les notifications. Une course en attente de validation (REQUESTED) n'est pas
// proposée aux chauffeurs : elle ne peut pas être prise ainsi.
router.post("/:id/accept", requireRole("DRIVER"), async (req, res) => {
  const { count } = await prisma.ride.updateMany({
    where: { id: req.params.id, status: "BROADCAST", driverId: null },
    data: { driverId: req.user.id, status: "ACCEPTED", acceptedAt: new Date() },
  });
  if (count === 0) {
    const existe = await prisma.ride.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: "Course introuvable." });
    return res.status(409).json({ error: "Cette course a déjà été prise par un autre chauffeur." });
  }
  const result = await prisma.ride.findUnique({ where: { id: req.params.id } });

  equipe(req, "ride:updated", result);
  equipe(req, "ride:notification", {
    rideId: result.id,
    status: result.status,
    text: `${req.user.name} a accepté la course ${result.pickupAddress} → ${result.destAddress}.`,
  });
  broadcast(req, "drivers", "ride:taken", { id: result.id }); // pour retirer la course chez les autres chauffeurs
  broadcast(req, `ride:${result.id}`, "ride:status", result);
  sendRideConfirmation(result.id); // le chauffeur qui prend la course la reçoit dans son agenda
  res.json(result);
});

// Dernière position connue du chauffeur de cette course — pour afficher la carte tout de suite
// à l'ouverture du suivi, sans attendre la prochaine mise à jour GPS.
router.get("/:id/driver-location", async (req, res) => {
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id } });
  if (!ride) return res.status(404).json({ error: "Course introuvable." });
  const isStaff = estEquipe(req.user) && aPermission(req.user, ...AUDIENCES.courses);
  if (!isStaff && req.user.id !== ride.clientId && req.user.id !== ride.driverId) {
    return res.status(403).json({ error: "Accès refusé." });
  }
  if (!ride.driverId) return res.json(null);
  const pos = getDriverLocation(ride.driverId);
  res.json(pos && pos.rideId === ride.id ? { lat: pos.lat, lng: pos.lng, status: pos.status, at: pos.at } : null);
});

router.post("/:id/refuse", requireRole("DRIVER"), async (req, res) => {
  // Un refus individuel ne change pas le statut global : la course reste disponible pour les
  // autres, mais n'est plus proposée à ce chauffeur. Seule une offre ouverte se refuse ainsi.
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id } });
  if (!ride) return res.status(404).json({ error: "Course introuvable." });
  if (ride.status !== "BROADCAST") return res.status(409).json({ error: "Cette course n'est plus proposée." });
  if (!ride.refusedBy.includes(req.user.id)) {
    await prisma.ride.update({ where: { id: ride.id }, data: { refusedBy: { push: req.user.id } } });
  }
  equipe(req, "ride:refused", { rideId: ride.id, driverId: req.user.id, driverName: req.user.name });
  equipe(req, "ride:notification", { rideId: ride.id, text: `${req.user.name} a refusé la course diffusée ${ride.pickupAddress} → ${ride.destAddress}.` });
  res.json({ ok: true });
});

// Progression du statut par le chauffeur : EN_ROUTE -> STARTED -> COMPLETED, ou abandon (envoyé
// « CANCELLED » par l'application) tant que la course n'est pas terminée — permet au chauffeur de
// libérer une course qu'il ne peut finalement pas honorer (besoin #9).
router.post("/:id/status", requireRole("DRIVER"), async (req, res) => {
  const { status } = req.body || {};
  const allowed = { EN_ROUTE: "enRouteAt", STARTED: "startedAt", COMPLETED: "completedAt", CANCELLED: "cancelledAt" };
  if (!allowed[status]) return res.status(400).json({ error: "Statut invalide." });

  const current = await prisma.ride.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "Course introuvable." });
  if (current.driverId !== req.user.id) return res.status(403).json({ error: "Cette course ne vous est pas affectée." });

  // Ordre des étapes imposé : ACCEPTED -> EN_ROUTE -> STARTED -> COMPLETED ; abandon possible
  // à tout moment avant la fin. Évite qu'un double appui ou un écran désynchronisé ne saute
  // une étape (ex. terminer une course jamais démarrée).
  const NEXT = { ACCEPTED: "EN_ROUTE", EN_ROUTE: "STARTED", STARTED: "COMPLETED" };
  const isTerminal = TERMINAL_STATUSES.includes(current.status);
  if (isTerminal) return res.status(409).json({ error: "Cette course est déjà terminée ou annulée." });
  if (status !== "CANCELLED" && NEXT[current.status] !== status) {
    return res.status(409).json({ error: `Étape invalide : la course est actuellement « ${current.status} ».` });
  }
  // Pas de départ par erreur ou par anticipation : « en route » et « démarrer » ne s'ouvrent que
  // 3 heures avant l'heure de prise en charge (demande du propriétaire du 6 octobre 2026).
  if ((status === "EN_ROUTE" || status === "STARTED") && !chauffeurPeutPartir(current)) {
    return res.status(409).json({
      error: `Trop tôt : vous pourrez vous mettre en route à partir de ${quandLisible(ouvertureDepart(current))} (3 heures avant la course).`,
    });
  }

  // Abandon par le chauffeur (audit du 7 octobre 2026, B04) : la course n'est PAS annulée pour le
  // client. Elle revient « à affecter » chez Taxi Sylvain (comme lors de la suppression d'un compte
  // chauffeur), et n'est plus proposée à ce chauffeur. Avant, elle passait « annulée » : elle sortait
  // des courses à faire, des rappels et des rapports alors que le client attendait un autre chauffeur.
  const abandon = status === "CANCELLED";
  // On garde la course complète sous la main pour retirer l'évènement de son agenda après la mise à
  // jour (la course ne lui sera plus rattachée).
  const previous = abandon ? await loadRideForEmail(req.params.id) : null;
  const data = abandon
    ? {
      status: "REQUESTED", driverId: null, acceptedAt: null, enRouteAt: null, startedAt: null,
      ...(current.refusedBy.includes(req.user.id) ? {} : { refusedBy: { push: req.user.id } }),
    }
    : { status, [allowed[status]]: new Date() };
  // Écriture conditionnelle : si la course a changé entre-temps (réaffectée par le Dispatch, double
  // appui), rien n'est modifié.
  const { count } = await prisma.ride.updateMany({ where: { id: current.id, driverId: req.user.id, status: current.status }, data });
  if (count === 0) return res.status(409).json({ error: "La course a changé entre-temps. Rafraîchissez l'écran." });
  const ride = await prisma.ride.findUnique({ where: { id: current.id } });

  if (abandon && previous?.driver) {
    sendRideCancellation(previous, [{ person: previous.driver, audience: "driver" }]);
  }
  if (abandon) {
    leaveRideRoom(req, req.user.id, ride.id);
    // Un rappel déjà parti vers ce chauffeur repartira vers le suivant.
    await oublierRappels(ride.id);
  }
  if (abandon || status === "COMPLETED") fermerSessionAppel(ride.id);

  const labels = {
    EN_ROUTE: `${req.user.name} est en route pour récupérer le client.`,
    STARTED: `${req.user.name} a démarré la course vers la destination.`,
    COMPLETED: `La course de ${req.user.name} est terminée.`,
    CANCELLED: `${req.user.name} a abandonné la course ${ride.pickupAddress} → ${ride.destAddress} : elle est de nouveau à affecter.`,
  };
  equipe(req, "ride:notification", { rideId: ride.id, status: ride.status, text: labels[status] });
  equipe(req, "ride:updated", ride);
  broadcast(req, `ride:${ride.id}`, "ride:status", ride);

  if (status === "COMPLETED" || abandon) {
    // Course finie ou abandonnée : le chauffeur n'a plus à apparaître sur la carte.
    effacerPosition(req, req.user.id);
  }

  const clientLabels = {
    EN_ROUTE: { title: "Votre chauffeur arrive", body: `${req.user.name} est en route pour vous récupérer.` },
    STARTED: { title: "Départ vers votre destination", body: "Votre course a démarré." },
    COMPLETED: { title: "Course terminée", body: "Merci d'avoir voyagé avec Taxi Sylvain." },
    CANCELLED: { title: "Changement de chauffeur", body: "Taxi Sylvain vous réaffecte un autre chauffeur pour votre course." },
  };
  if (ride.clientId && clientLabels[status]) {
    const charge = { ...clientLabels[status], data: { type: "ride:status", rideId: ride.id, status: ride.status } };
    notifyUser(ride.clientId, charge);
    signalerClient(req, ride.clientId, { rideId: ride.id, status: ride.status, ...charge });
  }
  res.json(ride);
});

// Appel vocal masqué entre le client et le chauffeur de la course (besoin #2) — nécessite un
// compte Twilio configuré (TWILIO_* dans .env), voir docs/ARCHITECTURE.md §3.
router.post("/:id/call", async (req, res) => {
  const ride = await prisma.ride.findUnique({
    where: { id: req.params.id },
    include: { client: true, driver: true },
  });
  if (!ride) return res.status(404).json({ error: "Course introuvable." });
  if (req.user.id !== ride.clientId && req.user.id !== ride.driverId) {
    return res.status(403).json({ error: "Accès refusé." });
  }
  if (!ride.client || !ride.driver) {
    return res.status(400).json({ error: "La course doit avoir un client et un chauffeur affectés." });
  }
  if (!callAllowedForStatus(ride.status)) {
    return res.status(409).json({ error: "L'appel masqué n'est possible que pour une course confirmée ou en cours." });
  }
  // Même délai que les messages : le chauffeur n'appelle le client qu'à partir de 2 heures avant
  // la course (demande du propriétaire du 6 octobre 2026). Le client peut appeler quand il veut.
  if (req.user.id === ride.driverId && !chauffeurPeutContacter(ride)) {
    return res.status(403).json({
      error: `Vous pourrez appeler le client à partir de ${quandLisible(ouvertureContact(ride))} (2 heures avant la course). D'ici là, passez par Taxi Sylvain.`,
    });
  }
  if (!isCallMaskingConfigured()) {
    return res.status(503).json({
      error: "Le masquage d'appel n'est pas configuré. Utilisez la messagerie interne en attendant, ou renseignez TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PROXY_SERVICE_SID dans backend/.env (voir .env.example).",
    });
  }

  try {
    const { proxyNumber } = await getOrCreateCallSession(ride);
    res.json({ proxyNumber });
  } catch (err) {
    // Numéro mal saisi dans une fiche : message clair, sans révéler le numéro de l'autre partie.
    // Seulement notre propre erreur : celles de Twilio restent génériques et sont journalisées.
    if (err.code === "NUMERO_INVALIDE") return res.status(400).json({ error: err.message });
    console.error("Erreur Twilio Proxy:", err.message);
    res.status(502).json({ error: "Impossible de créer l'appel masqué pour le moment." });
  }
});

// Corriger une course (Dispatch) : adresses, destination du catalogue, montant, heure, vol,
// distance, client, chauffeur et statut. Demande du propriétaire du 20 septembre 2026 : toutes les
// modifications doivent pouvoir se faire depuis Courses et depuis la Cédule. Seuls les champs
// envoyés sont modifiés ; chaque changement déclenche les mêmes effets que l'action équivalente
// (affectation, diffusion, annulation) : agenda, notifications, temps réel. Règles de statut dans
// lib/rideEdit.js.
router.patch("/:id", requirePermission("courses"), async (req, res) => {
  const corps = req.body || {};
  const {
    pickupAddress, destAddress, destinationCode, fare, flightNumber, scheduledFor,
    pickupLat, pickupLng, destLat, destLng, distanceKm, clientId, driverId, status,
  } = corps;
  const before = await loadRideForEmail(req.params.id);
  if (!before) return res.status(404).json({ error: "Course introuvable." });
  const data = {};
  if (pickupAddress !== undefined && !adresseValide(pickupAddress)) return res.status(400).json({ error: "Adresse de prise en charge invalide." });
  if (destAddress !== undefined && !destinationCode && !adresseValide(destAddress)) return res.status(400).json({ error: "Destination invalide." });

  // Adresses : mise à la forme unique et géocodage si besoin (voir lib/rideAddresses.js).
  const zonesEdition = pickupAddress !== undefined || destAddress !== undefined || destinationCode || corps.stops !== undefined ? await chargerZones() : [];
  if (pickupAddress !== undefined) {
    const r = await normaliserAdresse(pickupAddress, { zones: zonesEdition, coords: { lat: latitude(pickupLat), lng: longitude(pickupLng), confidence: corps.pickupConfidence } });
    data.pickupAddress = r.address ?? pickupAddress;
    data.pickupConfidence = r.confidence || null;
    if (r.coords && pickupLat === undefined) { data.pickupLat = r.coords.lat; data.pickupLng = r.coords.lng; }
    // Identifiant Google du lieu choisi dans la liste, sinon celui trouvé par le géocodage.
    data.pickupPlaceId = typeof corps.pickupPlaceId === "string" ? corps.pickupPlaceId.slice(0, 300) : r.placeId || null;
  }

  // Arrêts (6 octobre 2026) : la liste envoyée remplace la précédente ; une liste vide les retire.
  if (corps.stops !== undefined) {
    try {
      data.stops = await normaliserArrets(corps.stops, { zones: zonesEdition });
    } catch (e) {
      if (e instanceof ArretsInvalides) return res.status(400).json({ error: e.message });
      throw e;
    }
  }

  // Client : un compte CLIENT existant, ou aucun.
  if (clientId !== undefined && (clientId || null) !== (before.clientId || null)) {
    if (clientId) {
      const c = await prisma.user.findUnique({ where: { id: String(clientId) }, select: { role: true } });
      if (!c || c.role !== "CLIENT") return res.status(400).json({ error: "Client introuvable." });
    }
    data.clientId = clientId || null;
  }

  // Destination du catalogue (YUL, YHU, REM) : adresse et point vérifiés, tarif recalculé pour ce
  // client sauf si un montant est saisi en même temps. Sinon, adresse libre.
  if (destinationCode) {
    const q = await quote({ pickupAddress: data.pickupAddress ?? before.pickupAddress, destinationCode: String(destinationCode), clientId: data.clientId !== undefined ? data.clientId : before.clientId });
    if (!q.destination) return res.status(400).json({ error: "Destination du catalogue inconnue." });
    data.destAddress = q.destination.address;
    data.destLat = q.destination.lat;
    data.destLng = q.destination.lng;
    // Guidage direct seulement sur un point contrôlé du catalogue (voir la création ci-dessus).
    data.destConfidence = q.destination.pointVerified ? "verifie" : "rue";
    data.destPlaceId = null;
    if (fare === undefined && q.price != null) data.fare = q.price;
  } else if (destAddress !== undefined) {
    const r = await normaliserAdresse(destAddress, { zones: zonesEdition, coords: { lat: latitude(destLat), lng: longitude(destLng), confidence: corps.destConfidence } });
    data.destAddress = r.address ?? destAddress;
    data.destConfidence = r.confidence || null;
    if (r.coords && destLat === undefined) { data.destLat = r.coords.lat; data.destLng = r.coords.lng; }
    data.destPlaceId = typeof corps.destPlaceId === "string" ? corps.destPlaceId.slice(0, 300) : r.placeId || null;
  }
  if (fare !== undefined) {
    const n = montantCourse(fare);
    if (n === null) return res.status(400).json({ error: "Montant invalide." });
    data.fare = n;
  }
  if (flightNumber !== undefined) data.flightNumber = numeroDeVol(flightNumber);
  if (scheduledFor !== undefined) {
    const heure = heureDePriseEnCharge(scheduledFor);
    if (heure.erreur) return res.status(400).json({ error: heure.erreur });
    data.scheduledFor = heure.date;
  }
  if (pickupLat !== undefined) data.pickupLat = latitude(pickupLat);
  if (pickupLng !== undefined) data.pickupLng = longitude(pickupLng);
  if (destLat !== undefined && !destinationCode) data.destLat = latitude(destLat);
  if (destLng !== undefined && !destinationCode) data.destLng = longitude(destLng);
  if (distanceKm !== undefined) {
    const vide = distanceKm === null || distanceKm === "";
    const d = distanceSaisie(distanceKm);
    if (!vide && d === null) return res.status(400).json({ error: "Distance invalide." });
    data.distanceKm = vide ? null : d;
  }

  // Chauffeur : un compte DRIVER existant, ou aucun. Même règle que « Affecter » : la course passe
  // à « acceptée » avec un chauffeur, « en attente » sans, sauf statut imposé plus bas.
  const nouveauChauffeur = driverId !== undefined && (driverId || null) !== (before.driverId || null);
  if (nouveauChauffeur) {
    if (driverId) {
      const d = await prisma.user.findUnique({ where: { id: String(driverId) }, select: { role: true } });
      if (!d || d.role !== "DRIVER") return res.status(400).json({ error: "Chauffeur introuvable." });
    }
    data.driverId = driverId || null;
  }
  const termine = TERMINAL_STATUSES.includes(before.status);
  let statutImpose = false;
  if (status !== undefined && status !== before.status) {
    const r = changementDeStatut({ status, driverId: data.driverId !== undefined ? data.driverId : before.driverId, now: new Date() });
    if (r.error) return res.status(400).json({ error: r.error });
    Object.assign(data, r.data);
    statutImpose = true;
  } else if (nouveauChauffeur && !termine) {
    data.status = data.driverId ? "ACCEPTED" : "REQUESTED";
    if (data.driverId) data.acceptedAt = new Date();
  }
  const chauffeurRetire = Boolean(before.driverId && data.driverId !== undefined && data.driverId !== before.driverId);

  // Distance recalculée si un point a changé et qu'aucune distance n'est saisie à la main.
  const pointChange = ["pickupLat", "pickupLng", "destLat", "destLng", "stops"].some((k) => data[k] !== undefined);
  if (pointChange && distanceKm === undefined) {
    const merged = { ...before, ...data };
    data.distanceKm = await computeDistanceKm({ lat: merged.pickupLat, lng: merged.pickupLng }, { lat: merged.destLat, lng: merged.destLng }, arretsDe(merged));
  }

  const ride = await prisma.ride.update({
    where: { id: req.params.id },
    data,
    include: { client: { select: { id: true, name: true } }, driver: { select: { id: true, name: true, carModel: true, carColor: true, plate: true } } },
  });
  equipe(req, "ride:updated", ride);
  broadcast(req, `ride:${ride.id}`, "ride:status", ride);

  // Ancien chauffeur : retiré du suivi, course sortie de son agenda, appel masqué fermé.
  if (chauffeurRetire) retirerChauffeur(req, before, ride);
  // Nouveau chauffeur : même accueil qu'une affectation.
  if (ride.driverId && ride.driverId !== before.driverId) {
    broadcast(req, `driver:${ride.driverId}`, "ride:assigned", ride);
    notifyUser(ride.driverId, { title: "Nouvelle course assignée", body: trajetCourt(ride), data: { type: "ride:assigned", rideId: ride.id } });
    if (ride.clientId && ride.driver) {
      const charge = {
        title: "Votre chauffeur est confirmé",
        body: `${ride.driver.name}${vehiculeTexte(ride.driver)} — ${trajetCourt(ride)}`,
        data: { type: "ride:status", rideId: ride.id, status: ride.status },
      };
      notifyUser(ride.clientId, charge);
      signalerClient(req, ride.clientId, { rideId: ride.id, status: ride.status, ...charge });
    }
  } else if (ride.driverId) {
    // « ride:updated » et non « ride:assigned » : une correction de détail ne doit pas faire
    // sonner l'application du chauffeur comme une nouvelle course ni le sortir de son écran.
    broadcast(req, `driver:${ride.driverId}`, "ride:updated", ride);
  }

  // Ancien client : la course sort de son agenda et de son suivi ; le nouveau la reçoit plus bas.
  if (data.clientId !== undefined && before.client) {
    sendRideCancellation(before, [{ person: before.client, audience: "client" }]);
    leaveRideRoom(req, before.clientId, ride.id);
    fermerSessionAppel(ride.id);
  }

  if (statutImpose) {
    equipe(req, "ride:notification", { rideId: ride.id, status: ride.status, text: texteChangementDeStatut({ auteur: req.user.name, ride, status: ride.status }) });
    if (ride.status === "BROADCAST") {
      broadcast(req, "drivers", "ride:broadcast", ride);
      notifyAllDrivers({ title: "Course de dernière minute", body: `${trajetCourt(ride)} — premier arrivé, premier servi`, data: { type: "ride:broadcast", rideId: ride.id } });
    }
    if (ride.status === "CANCELLED") {
      sendRideCancellation(before, [
        before.driver && !chauffeurRetire ? { person: before.driver, audience: "driver" } : null,
        before.client && data.clientId === undefined ? { person: before.client, audience: "client" } : null,
      ]);
    }
    if (ride.status === "COMPLETED" || ride.status === "CANCELLED") {
      if (ride.driverId) effacerPosition(req, ride.driverId);
      fermerSessionAppel(ride.id);
    }
    const pourClient = {
      EN_ROUTE: { title: "Votre chauffeur arrive", body: "Votre chauffeur est en route pour vous récupérer." },
      STARTED: { title: "Départ vers votre destination", body: "Votre course a démarré." },
      COMPLETED: { title: "Course terminée", body: "Merci d'avoir voyagé avec Taxi Sylvain." },
      CANCELLED: { title: "Course annulée", body: `Votre course ${ride.pickupAddress} → ${ride.destAddress} a été annulée par Taxi Sylvain. Appelez le 438-499-1120 pour toute question.` },
    }[ride.status];
    if (ride.clientId && pourClient) {
      const charge = { ...pourClient, data: { type: "ride:status", rideId: ride.id, status: ride.status } };
      notifyUser(ride.clientId, charge);
      signalerClient(req, ride.clientId, { rideId: ride.id, status: ride.status, ...charge });
    }
  }

  // Un détail qui figure dans l'agenda a changé, ou la course a changé de mains : l'invitation
  // mise à jour remplace l'évènement déjà présent chez le chauffeur et le client.
  const AGENDA_FIELDS = ["scheduledFor", "pickupAddress", "destAddress", "fare", "flightNumber"];
  const agendaChanged = AGENDA_FIELDS.some((field) => {
    if (data[field] === undefined) return false;
    const a = before[field] instanceof Date ? before[field].getTime() : before[field];
    const b = ride[field] instanceof Date ? ride[field].getTime() : ride[field];
    return a !== b;
  }) || data.clientId !== undefined || Boolean(ride.driverId && ride.driverId !== before.driverId)
    || (data.stops !== undefined && JSON.stringify(arretsDe(before)) !== JSON.stringify(arretsDe(ride)));
  if (agendaChanged && ride.status !== "CANCELLED" && (ride.driverId || ride.clientId)) sendRideConfirmation(ride.id);

  // L'heure a changé : les rappels déjà notés n'ont plus de sens. Sans cet effacement, une
  // course déplacée ne redéclenchait plus jamais de rappel.
  if (data.scheduledFor !== undefined && new Date(before.scheduledFor).getTime() !== new Date(ride.scheduledFor).getTime()) {
    await oublierRappels(ride.id);
  }

  // Taxi Sylvain vient de fixer (ou corriger) le montant : le client reçoit le récapitulatif.
  if (ride.clientId && data.fare !== undefined && ride.fare > 0 && ride.fare !== before.fare && !statutImpose) {
    const when = ride.scheduledFor
      ? new Date(ride.scheduledFor).toLocaleString("fr-CA", { timeZone: "America/Toronto", dateStyle: "short", timeStyle: "short", hourCycle: "h23" })
      : "dès que possible";
    const charge = {
      title: `Course validée — ${ride.fare.toFixed(2)} $`,
      body: `${ride.pickupAddress} → ${ride.destAddress} · ${when}${ride.driver ? ` · chauffeur ${ride.driver.name}` : ""}`,
      data: { type: "ride:status", rideId: ride.id, status: ride.status },
    };
    notifyUser(ride.clientId, charge);
    signalerClient(req, ride.clientId, { rideId: ride.id, status: ride.status, ...charge });
  }
  res.json(ride);
});

// Supprimer une course erronée (Dispatch)
router.delete("/:id", requirePermission("courses"), async (req, res) => {
  // Chargée avant la suppression : les courriels d'annulation ont encore besoin de ses détails.
  const previous = await loadRideForEmail(req.params.id);
  if (!previous) return res.status(404).json({ error: "Course introuvable." });
  await prisma.$transaction(async (tx) => {
    await tx.rating.deleteMany({ where: { rideId: req.params.id } });
    await tx.ride.delete({ where: { id: req.params.id } });
  });

  // Tous les écrans ouverts retirent la course (audit du 7 octobre 2026, B15) : avant, le Dispatch,
  // le chauffeur et le client la gardaient affichée jusqu'au rechargement. « ride:updated » annulée
  // sert aussi aux applications déjà installées, qui ne connaissent pas « ride:deleted ».
  const retrait = { id: previous.id, status: "CANCELLED", deleted: true };
  equipe(req, "ride:deleted", { id: previous.id });
  equipe(req, "ride:updated", retrait);
  broadcast(req, `ride:${previous.id}`, "ride:status", retrait);
  if (previous.status === "BROADCAST") broadcast(req, "drivers", "ride:taken", { id: previous.id });
  if (previous.driverId) {
    broadcast(req, `driver:${previous.driverId}`, "ride:deleted", { id: previous.id });
    broadcast(req, `driver:${previous.driverId}`, "ride:updated", retrait);
    const pos = getDriverLocation(previous.driverId);
    if (pos?.rideId === previous.id) effacerPosition(req, previous.driverId);
  }
  if (previous.clientId && !TERMINAL_STATUSES.includes(previous.status)) {
    signalerClient(req, previous.clientId, {
      rideId: previous.id, status: "CANCELLED", deleted: true,
      title: "Course annulée", body: `Votre course ${previous.pickupAddress} → ${previous.destAddress} a été retirée par Taxi Sylvain. Appelez le 438-499-1120 pour toute question.`,
    });
  }
  fermerSessionAppel(previous.id);
  // La course n'existe plus : plus personne ne reste abonné à son suivi.
  req.app.get("io")?.socketsLeave(`ride:${req.params.id}`);
  sendRideCancellation(previous, [
    previous.driver ? { person: previous.driver, audience: "driver" } : null,
    previous.client ? { person: previous.client, audience: "client" } : null,
  ]);
  res.status(204).end();
});

function sanitizeRide(ride, requester) {
  // Ne jamais exposer le téléphone direct de l'autre partie — seulement nom, véhicule, note.
  const out = { ...ride };
  // La liste des chauffeurs qui ont refusé l'offre ne regarde que l'équipe.
  if (!estEquipe(requester)) delete out.refusedBy;
  if (out.client) out.client = { id: out.client.id, name: out.client.name };
  if (out.driver) out.driver = { id: out.driver.id, name: out.driver.name, carModel: out.driver.carModel, carColor: out.driver.carColor, plate: out.driver.plate, ratingAvg: out.driver.ratingAvg, photoUrl: out.driver.photoUrl, carPhotoUrl: out.driver.carPhotoUrl };
  return out;
}

// Un chauffeur perd la course (réaffectation, rediffusion, modification) : sortie de son agenda et
// de son suivi, écran mis à jour, position effacée s'il roulait pour elle, appel masqué fermé.
function retirerChauffeur(req, before, ride) {
  if (before.driver) sendRideCancellation(before, [{ person: before.driver, audience: "driver" }]);
  leaveRideRoom(req, before.driverId, ride.id);
  broadcast(req, `driver:${before.driverId}`, "ride:updated", ride);
  const pos = getDriverLocation(before.driverId);
  if (pos?.rideId === ride.id) effacerPosition(req, before.driverId);
  fermerSessionAppel(ride.id);
}

// Retire toutes les connexions d'un compte du suivi d'une course : position, messages et étapes.
// Sans cela, un chauffeur à qui la course était retirée continuait de recevoir la discussion
// entre le client et le nouveau chauffeur (relecture du 19 septembre 2026).
function leaveRideRoom(req, userId, rideId) {
  const io = req.app.get("io");
  if (io && userId) io.in(`user:${userId}`).socketsLeave(`ride:${rideId}`);
}

// Évènement personnel du client (salle user:{id}), reçu quel que soit l’écran ouvert : son et
// notification du navigateur dans l’application client. Avant le 20 septembre 2026, le client
// n’entendait un changement que s’il avait l’écran de suivi de cette course ouvert.
function signalerClient(req, clientId, charge) {
  if (clientId) broadcast(req, `user:${clientId}`, "ride:client-update", charge);
}

// Évènement de course pour l'équipe autorisée (Courses ou Cédule), jamais pour toute l'équipe.
function equipe(req, event, payload) {
  emettreEquipe(req.app.get("io"), AUDIENCES.courses, event, payload);
}

// Le chauffeur disparaît de la carte en direct.
function effacerPosition(req, driverId) {
  if (clearDriverLocation(driverId)) emettreEquipe(req.app.get("io"), AUDIENCES.positions, "driver:location:clear", { driverId });
}

function broadcast(req, room, event, payload) {
  const io = req.app.get("io");
  if (io) io.to(room).emit(event, payload);
}

export default router;
