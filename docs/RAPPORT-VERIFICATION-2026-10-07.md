# Taxi Sylvain — Rapport complet pour vérification par un développeur senior

État au **7 octobre 2026**. Dépôt `paulemileverges-star/taxi-sylvain` (privé), branche `master`, dernier
commit de code `c088514` (version 1.5.0 des applications). Ce rapport accompagne le dossier
`TAXI-SYLVAIN-DOSSIER-COMPLET` ; il dit ce qui existe, ce qui a changé les 6 et 7 octobre, comment le
vérifier, et ce qui reste fragile. Les documents de fond sont dans le dépôt : `docs/PASSATION.md`
(référence d'exploitation, § 11 = registre de toutes les demandes), `docs/ARCHITECTURE.md`,
`docs/CONFORMITE-MAGASINS.md`, `AGENTS.md`.

---

## 1. Le projet en bref

Plateforme de répartition de taxi et de transferts aéroport (YUL, YHU, station REM de Brossard) pour
Taxi Sylvain, Longueuil (Québec). Trois interfaces reliées à une même API :

| Élément | Adresse de production | Code |
|---|---|---|
| API (Express, Prisma, PostgreSQL, Socket.io) | https://api.taxisylvain.ca (santé : `/health`) | `backend/` |
| Console Dispatch (propriétaire et collaborateurs à permissions) | https://dispatch.taxisylvain.ca | `apps/dispatch-web/` (React, Vite) |
| Application Chauffeur (APK, TestFlight, version web) | https://chauffeur.taxisylvain.ca | `apps/driver-app/` (Expo SDK 54, RN 0.81) |
| Application Client (APK, TestFlight, version web) | https://client.taxisylvain.ca | `apps/client-app/` (Expo SDK 54) |
| Site vitrine (WordPress, hors dépôt) | https://taxisylvain.ca | dossier `06-SITE-WORDPRESS` |

Hébergement : Railway (API, Postgres, disque persistant `/app/uploads`, formule Hobby depuis le
6 octobre 2026, région `iad`), Vercel (trois sites), Expo EAS (compilations), LWS (WordPress).
Services : Brevo (courriels), Twilio Proxy (appels masqués, rappel vocal), Firebase/APNs (notifications
des applications), Web Push (versions web), OpenStreetMap/OSRM (adresses, distances), Google Maps
(adresses, dès que la clé est posée).

Fonctions principales : création et diffusion de courses (premier chauffeur qui accepte), étapes
imposées (acceptée → en route → démarrée → effectuée), suivi GPS en direct, messagerie sans échange de
numéros, appel masqué dans les deux sens, rappels (courriel, notification, appel vocal), cédule,
grille tarifaire de 115 municipalités et prix négociés par client, notation, récapitulatif hebdomadaire
et redevance de 10 %, exports PDF/Excel, demandes de suppression de compte validées par le Dispatch,
pages légales (Loi 25), et depuis le 6 octobre : arrêts, fiche chauffeur modifiable, deux adresses YUL,
délais de contact et de départ, rapports par date de course.

---

## 2. Architecture (rappel)

- **API** : `backend/src/index.js` (montage, tâches planifiées), `routes/` (une route par domaine),
  `lib/` (règles métier, la plupart pures et testées), `jobs/` (rappels chaque minute, récap du lundi),
  `sockets/` (salles `dispatch`, `drivers`, `driver:{id}`, `client:{id}`, `ride:{id}`, `user:{id}`).
- **Données** : `backend/prisma/schema.prisma`, **23 migrations** appliquées au démarrage
  (`prisma migrate deploy` dans `npm start`). Identifiants `cuid`, dates en UTC (timestamp sans zone).
- **Rôles** : `CLIENT`, `DRIVER`, `DISPATCH` (tout), `ADMIN` (permissions `courses`, `schedule`,
  `drivers`, `clients`, `reports`, `groups`) ; middleware `requirePermission`. JWT revérifié en base à
  chaque requête (compte existant, rôle à jour).
- **Fuseau** : toutes les règles de dates à l'heure du Québec (`America/Toronto`), jamais celle du
  serveur (UTC) : `lib/ridesOrder.js`, `lib/semaines.js`.
- **Navigation** : `apps/driver-app/src/lib/navigationLinks.js`, fichier pur testé par les tests du
  serveur (`backend/test/navigationLinks.test.js`).

---

## 3. État au 7 octobre 2026

| Sujet | État | Preuve |
|---|---|---|
| Tests unitaires du serveur | **297 / 297** | `04-VERIFICATIONS/01-tests-unitaires.log` |
| Scénario de bout en bout (vrai serveur, base PostgreSQL jetable, aucun fournisseur réel) | **10 / 10** | `backend/test-e2e/scenario-2026-10-06.mjs`, journal `02-…` |
| Contrôle de la production (14 points : API, pages légales, site, trois sites à jour, CORS) | **vert** | `scripts/verifier-mise-en-ligne.mjs`, journal `03-…` |
| Écrans (console, chauffeur, client) contrôlés dans Edge piloté sur un serveur local | 10 captures | `04-VERIFICATIONS/captures/` |
| API en production | commit `f8f5cd5` (+ scripts sans effet sur l'API), déploiement Railway `4a069ee2`, migration `20261006120000_vague_6_octobre` appliquée | journaux Railway |
| Sites web | publiés le 6 octobre au soir depuis `f8f5cd5` | contrôle de production |
| Applications | **1.5.0 (versionCode / buildNumber 7)** compilées le 7 octobre : chauffeur Android `b38b444a`, iPhone `ce7fdd27` ; client Android `1d686fbe`, iPhone `37a18c4d` ; iPhone envoyées à App Store Connect | `07-APPLICATIONS/Liens-de-telechargement.txt` |
| Liens Android définitifs (`/telecharger/*.apk`) | servent encore la **1.4.0** : la 1.5.0 attend l'essai du propriétaire | — |
| Sauvegardes de la base | chaque nuit 3 h 30 + au démarrage, 14 gardées, copie hors Railway par le propriétaire | `docs/PASSATION.md` § 6 |
| Alertes d'erreurs | par courriel (Brevo) à `contact@taxisylvain.ca`, anti-avalanche 30 min | § 6 |
| Surveillance | GitHub Actions, toutes les heures, `.github/workflows/surveillance.yml` | § 5 |

---

## 4. Ce qui a changé les 6 et 7 octobre 2026

### 4.1 Exploitation (6 octobre, première série)

- **Sauvegarde de la base** (`lib/sauvegarde.js`) : `json_agg` par table, gzip, dossier caché
  `/app/uploads/.sauvegardes/` ; Railway ne sauvegarde Postgres qu'en formule Pro. Le dossier est sous
  `/uploads` (servi publiquement) : protégé par `dotfiles: "deny"` dans `fichiersPublics()`, testé avec
  des chemins encodés (`%2E`, `..%2F`) et vérifié en production (404). Restauration
  `backend/scripts/restaurer-sauvegarde.mjs` : à blanc par défaut, refuse une base distante sans
  `--production`, compare les migrations, insère dans l'ordre des clés étrangères
  (`ordreInsertion`), une seule transaction, recompte ; éprouvée sur base jetable (0 écart ligne à ligne).
- **Alertes** (`lib/alertes.js`, branché dans `lib/httpSafety.js` et les tâches planifiées) ; un
  `uncaughtException` prévient puis arrête le processus (Railway redémarre).
- **Surveillance horaire** GitHub Actions ; **constats** : essai Railway expirant le 8 octobre (formule
  Hobby prise le 6 au soir), compilations TestFlight 1.4.0 expirées le 2 octobre (remplacées par la 1.5.0).

### 4.2 Les treize demandes du propriétaire (6 octobre au soir)

| # | Demande | Réalisation | Fichiers principaux | Vérification |
|---|---|---|---|---|
| 1 | Modifier la fiche d'un chauffeur (véhicule, couleur, nom…) | `PATCH /api/drivers/:id` (permission `drivers`), `User.carColor`, courriel unique, fenêtre « Modifier » ; couleur visible du client | `routes/drivers.js:135`, `lib/ficheChauffeur.js`, `pages/Drivers.jsx` | tests `ficheChauffeur`, e2e, capture 04 |
| 2 | Arrêts (client, ami du client, puis YUL) | `Ride.stops` (JSON, 5 au plus, ordre), normalisés et géocodés comme les autres adresses, distance OSRM par les arrêts, courriels et `.ics`, console (création, modification, liste, cédule), applications (affichage, une étape de navigation par arrêt, itinéraire complet Google Maps) | `lib/arrets.js`, `routes/rides.js:166` et `:537`, `components/ArretsEditor.jsx`, `ActiveRideScreen.js` | tests `arrets`, e2e, captures 05-08 |
| 3 | Récap hebdomadaire faux certaines semaines | **Cause** : les courses comptaient à la date de « Terminer » (`completedAt`) ; une course du dimanche 22 h 30 terminée après minuit passait à la semaine suivante, une course jamais terminée disparaissait, le récap était figé au lundi. **Correction** : règle unique `lib/rapports.js` (date de prise en charge prévue, sinon création, heure du Québec ; montants sur « Effectuée »), recalcul à chaque lecture (`/reports/mine`, `/my-earnings`, `/periode`, exports) | `lib/rapports.js`, `lib/semaines.js`, `routes/reports.js`, `jobs/weeklyReport.js` | test sur la semaine du tableau de Taxi Sylvain (11 courses, 1 305 $, 130,50 $), e2e, capture 02 |
| 4 | Adresses réelles de Google Maps, suggestions fiables | Places API (New) Autocomplete + Place Details (champs « Essentials ») + Geocoding, côté serveur seulement ; jeton de session ; repli OpenStreetMap ; repère « adresse vérifiée » et avertissement « introuvable sur la carte » | `lib/googleMaps.js`, `routes/geocode.js`, `components/AddressInput.jsx`, `client-app/.../AddressInput.js` | tests `googleMaps` sur réponses au format officiel ; **pas encore éprouvé en réel : clé à poser** |
| 5 | Contact du client (message, appel masqué) à partir de 2 h | `chauffeurPeutContacter` (avant : 1 h pour les messages, aucun délai pour l'appel) | `lib/fenetres.js:25`, `routes/messages.js`, `routes/rides.js:485` | tests `fenetres`, `rules` ; e2e |
| 6 | Départ (en route, démarrer) à partir de 3 h | refus serveur `409` + affichage « Disponible à HH:MM (3 h avant) » | `lib/fenetres.js:32`, `routes/rides.js:414`, `ActiveRideScreen.js` | tests ; e2e ; capture 08 |
| 7 | YUL : Arrivées et P4 seulement | catalogue `YUL` (Arrivées, point sur la voie des arrivées) et `YULP4` (590 Albert-De Niverville), même tarif (`champPrix`), recherche exclusive ; `Destination.pointVerified` | `lib/aeroportYul.js`, `lib/seedDestinations.js`, `lib/pricing.js` | tests ; vérifié en production (`scripts/catalogue-yul.mjs`) ; capture 06 |
| 8 | Rapports du Dispatch : erreurs, navigation entre semaines, par chauffeur, effectuées et à effectuer | page refaite (`GET /api/reports/periode`) ; exports au format du tableau du propriétaire ; **dates des exports corrigées** (calculées en UTC : le dimanche s'affichait lundi) | `pages/Reports.jsx`, `lib/exportReport.js` | tests `exportReport`, captures 01-02 |
| 9 | Notification de récap reçue quatre fois | chaque clic « Générer » renvoyait la notification ; désormais `WeeklyReport.notifiedAt`, une seule par chauffeur et par semaine, marquage atomique (`updateMany … notifiedAt: null`) ; recalcul manuel silencieux | `jobs/weeklyReport.js:138` | e2e (deux générations automatiques + une manuelle = une notification) |
| 10 | Heure sur 24 h partout | `heure()` (console, applications), plus aucun `toLocaleTimeString` | `dispatch-web/src/lib/heure.js`, `driver-app/src/lib/dates.js` | captures, banc (aucun AM/PM) |
| 11 | Google Maps mène à une autre adresse | **Causes** : point de YUL = centre des pistes (45.4706, -73.7408) ; Google Maps recevait des coordonnées OpenStreetMap « porte » au lieu de l'adresse écrite. **Correction** : Google reçoit l'adresse écrite (+ `destination_place_id`), coordonnées seulement sur point de catalogue vérifié ; YHU (point non vérifié) guidé par le texte | `navigationLinks.js`, `lib/aeroportYul.js` | tests `navigationLinks` (15) |
| 12 | Récap le lundi à 04 h 00 | `cron.schedule("0 4 * * 1", …, America/Toronto)` | `src/index.js:128` | lecture du code |
| 13 | Rapport complet et dossier unique | ce rapport et `TAXI-SYLVAIN-DOSSIER-COMPLET` | — | — |

Autres changements : `expo-audio` remplace `expo-av` (préparation d'Expo SDK 55), `expo-asset` aligné
sur SDK 54 (sinon modules natifs en double), permissions inutiles bloquées : **la 1.5.0 retire
`RECORD_AUDIO` des deux APK** (la 1.4.0 la déclarait), vérifié par lecture des manifestes ;
`SwipeButton` garde son geste dans une liste qui défile (`onPanResponderTerminationRequest`).

---

## 5. Comment vérifier (pas à pas)

```bash
# 1. Code (copie dans 01-CODE, ou clone du dépôt privé)
cd taxi-sylvain/backend && npm ci && npm test            # 297 tests, ~30 s, sans base de données

# 2. Bout en bout (PostgreSQL local requis ; PG_BIN si ailleurs que C:/Program Files/PostgreSQL/17/bin)
node test-e2e/scenario-2026-10-06.mjs                    # base jetable, serveur local neutralisé, 10 vérifications

# 3. Production (lecture seule)
cd .. && node scripts/verifier-mise-en-ligne.mjs         # 14 contrôles

# 4. Applications
cd apps/driver-app && npm ci && npx expo-doctor          # 18/18 attendu (idem client-app)
```

**Points de revue prioritaires** (là où une erreur coûte de l'argent ou de la confiance) :

1. `backend/src/lib/rapports.js` et `routes/reports.js` : la règle « date de la course » et le recalcul
   à chaque lecture. Question à trancher : une course `ACCEPTED` d'il y a trois semaines jamais terminée
   reste « à effectuer » (non comptée) ; le Dispatch doit la corriger. `scripts/comparer-rapports.mjs`
   (sur une copie de la base) liste ces cas semaine par semaine.
2. `jobs/weeklyReport.js:138` : suppression des récaps devenus vides (`deleteMany … notIn`), marquage
   `notifiedAt` avant envoi.
3. `routes/rides.js` (création, `PATCH`) : arrêts, identifiants Google, précision du point de
   destination, messages d'adresse introuvable.
4. `lib/googleMaps.js` : jamais appelé en réel (pas de clé au 7 octobre). Vérifier les formats de
   réponse, la facturation (champs « Essentials »), la mise en forme `formeDepuisGoogle` contre la grille
   tarifaire (le garde-fou `canonicalAddress` refuse toute forme qui changerait la municipalité).
5. `lib/sauvegarde.js` `fichiersPublics()` : le dossier des sauvegardes vit sous un dossier public.
6. Migration `20261006120000_vague_6_octobre` : uniquement des ajouts de colonnes ; `notifiedAt` des
   anciens récaps posé à `createdAt` pour ne rien renvoyer.

---

## 6. Points de vigilance et dette connue (constatés, non cachés)

- **Google Maps non éprouvé en réel** : tant que `GOOGLE_MAPS_API_KEY` n'est pas posée, OpenStreetMap
  reste utilisé (codes postaux parfois faux, numéros absents). À la pose de la clé : fixer des **quotas
  quotidiens par API** dans la console Google (les routes `/api/geocode/*` sont ouvertes à tout compte
  connecté, clients compris, sans limite de débit dédiée : un abus coûterait de l'argent).
- **Données passées** : le nouveau calcul change les chiffres des semaines où des courses avaient été
  terminées en retard ou jamais terminées ; la comparaison sur les vraies données n'a pas été faite par
  l'équipe (copie de production réservée au propriétaire) : `scripts/comparer-rapports.mjs`.
- **Version 1.5.0 non essayée sur un vrai téléphone** (sons `expo-audio`, mode silencieux, GPS, appel
  masqué réel). Les liens définitifs servent la 1.4.0 jusqu'à cet essai. Les versions web publiées le
  6 octobre utilisent encore `expo-av` ; la prochaine publication web embarquera `expo-audio`.
- **APK client 1.5.0** : déclare `FOREGROUND_SERVICE` (apporté par `expo-audio`, permission ordinaire) ;
  bloquée dans `app.json` pour la prochaine compilation.
- **TestFlight** : informations d'examen bêta jamais saisies (titulaire du compte) ; le groupe externe
  ne peut pas installer avant l'examen. Le compte Apple Developer héberge aussi deux applications
  Neomoov (même titulaire).
- **Pas d'environnement de test séparé** sur Railway (prévu ; la formule Hobby le permet désormais).
- **Pas de tests automatiques d'écrans** : le banc Edge utilisé le 6 octobre n'est pas dans le dépôt.
- **Sauvegardes** : sur le même disque que l'API ; la copie hors Railway dépend d'un geste hebdomadaire.
- **Point de YHU** non vérifié ; **région Railway `iad`** (données hors Québec, à valider au regard de la
  Loi 25 par un juriste) ; pages légales non relues par un juriste.
- **Dette** : `CORS_ORIGIN` accepte tout sous-domaine `*-taxi-sylvain.vercel.app` (aperçus Vercel) ;
  JWT sans révocation (un changement de mot de passe n'invalide pas les jetons déjà émis ; seule la
  suppression du compte le fait) ; limite de débit seulement sur les routes de connexion, d'inscription,
  de code et de suppression de compte ;
  `GET /api/rides` sans pagination pour le Dispatch (charge tout l'historique).

---

## 7. Exploitation

Déploiement, variables (noms), pièges, comptes : `docs/PASSATION.md` § 2 à § 8 et § 12. Les secrets ne
sont **jamais** dans le dépôt ni dans ce dossier : variables Railway, Vercel et EAS ; fichiers du
propriétaire dans `C:\Users\PC\cles-taxi-sylvain` (non copié). Outils de compilation et d'envoi :
`05-OUTILS/` (`compiler-tout.cjs`, `etat-compilations.cjs`, `eas-submit-ios.mjs`, `apple-testflight.mjs`).

---

## 8. Historique résumé

8–13 septembre : cahier des charges, trois applications, corrections en vagues. 19 septembre : domaine,
GitHub, relecture adversariale (failles corrigées), pages légales. 20 septembre : reprise, mise en
ligne complète, Brevo, Firebase, APK 1.3.0. 21 septembre : site WordPress, courriel de contact.
23 septembre : Twilio, Expo SDK 54, TestFlight, APK 1.4.0, audit de conformité (89/96).
6 octobre : sauvegardes, alertes, surveillance ; treize demandes. 7 octobre : version 1.5.0 compilée,
iPhone envoyées à Apple. Détail demande par demande : `docs/PASSATION.md` § 11.
