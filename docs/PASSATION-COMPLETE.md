# Passation complète — Taxi Sylvain

**Pour l'assistant ou le développeur qui reprend le projet.**
État arrêté au **20 septembre 2026**, après la vague de corrections et la vérification complète.

Ce document est autonome : il suffit à reprendre le projet sans rien d'autre. Il reprend et
complète `docs/PASSATION.md` du dépôt, qui reste la référence vivante à tenir à jour.

---

## 0. En dix lignes

Taxi Sylvain est une entreprise de taxi et de transferts aéroport de Chambly, sur la Rive-Sud de
Montréal. Le projet est une plateforme complète : un serveur, une console de répartition et deux
applications mobiles (chauffeur et client), **déjà en production, avec de vrais clients et de vrais
chauffeurs**. Le propriétaire n'est pas développeur ; il teste lui-même en production.

Tout ce qui est décrit ici fonctionne réellement, sauf mention contraire explicite. Le projet
compte 201 tests automatiques, 20 migrations de base de données, et un script de vérification qui
contrôle les adresses publiques après chaque mise en ligne.

**Ce qui bloque aujourd'hui** n'est pas du code : ce sont deux comptes fournisseurs à finir de
brancher (Twilio, Apple) et trois décisions d'entreprise. Voir § 6 et § 7.

---

## 1. Comment travailler avec le propriétaire

C'est la partie la plus importante de ce document. Le reste est technique et se retrouve dans le
code ; ceci ne s'y retrouve pas.

- **Il n'est pas développeur.** Écrire en français, en phrases courtes, sans jargon. Ne jamais lui
  demander de lire du code. Lui donner des liens, des fichiers, des boutons.
- **Il délègue entièrement**, et il attend qu'on avance sans lui poser dix questions. Quand une
  décision lui revient vraiment (argent, données, irréversible), la poser en une phrase, avec une
  recommandation.
- **Il teste en production.** Une régression est visible par un vrai chauffeur dans l'heure.
- **Ce qu'il a reproché une fois, et qu'il ne faut pas refaire** : « trop d'erreurs, de bugs,
  d'omissions ». Deux causes réelles : une correction avait cassé le suivi GPS sans que personne ne
  le voie pendant une semaine, et l'adresse publique de l'application client servait une version
  vieille de neuf jours. D'où les règles ci-dessous.

### Règles de travail non négociables

1. **Preuve avant annonce.** Avant de dire « c'est corrigé » :
   ```bash
   cd backend && npm test
   node scripts/verifier-mise-en-ligne.mjs
   ```
2. **Une règle métier demandée = un test.** Sans exception. C'est ce qui empêche une demande de se
   reperdre trois vagues plus tard.
3. **Ne jamais recompiler les applications (APK/iOS) sans son accord explicite.** Les corrections
   web sont livrables tout de suite ; les écrans des téléphones attendent une compilation.
4. **Actions irréversibles** (supprimer un projet, un service, un volume, des données) : demander
   avant, toujours.
5. **Aucun secret dans le dépôt.** Les clés vivent dans `C:\Users\PC\cles-taxi-sylvain`.
6. **Ne jamais pointer un environnement local vers la base de production.**
7. **Après un déploiement de l'application client** : `vercel alias set` pour l'ancienne adresse
   (voir § 4).

---

## 2. Architecture

```
C:\Users\PC\code\taxi-sylvain          dépôt (GitHub privé paulemileverges-star/taxi-sylvain)
├── backend/                API Node.js + Express 4 + Socket.io, Prisma + PostgreSQL
│   ├── prisma/schema.prisma      modèle de données, 20 migrations appliquées au démarrage
│   ├── src/index.js              serveur, routes, tâches planifiées, diagnostics au démarrage
│   ├── src/routes/               15 fichiers : rides, auth, clients, drivers, admins, pricing,
│   │                             destinations, messages, conversations, schedule, reports,
│   │                             ratings, geocode, suggestions, public
│   ├── src/lib/                  26 fichiers — le cœur métier (voir § 3)
│   ├── src/jobs/                 rideReminders (chaque minute), weeklyReport (lundi 00 h 05)
│   ├── src/public/               3 pages légales servies publiquement
│   └── test/                     20 fichiers, 201 tests (node --test)
├── apps/dispatch-web/      console Dispatch — React + Vite
├── apps/driver-app/        application chauffeur — React Native / Expo SDK 51 (+ version web)
├── apps/client-app/        application client — React Native / Expo SDK 51 (+ version web)
├── scripts/verifier-mise-en-ligne.mjs
└── docs/                   PASSATION.md, ARCHITECTURE.md, CONFORMITE-MAGASINS.md, FIREBASE-PUSH.md
```

**Rôles** : `CLIENT`, `DRIVER`, `DISPATCH` (le propriétaire, accès total), `ADMIN` (collaborateur
avec des permissions choisies : courses, schedule, drivers, clients, reports, groups).
Middleware `requirePermission(permission, ...rôlesSupplémentaires)`.

**Temps réel (Socket.io)** : salles `dispatch`, `drivers`, `driver:{id}`, `client:{id}`,
`user:{id}`, `ride:{id}`. La salle `ride:{id}` est réservée au client, à son chauffeur et à
l'équipe ; un chauffeur retiré d'une course en est éjecté (`socketsLeave`).

**Sécurité des sessions** : le jeton JWT est valable 30 jours, mais le rôle et les permissions sont
**relus en base à chaque requête** et à chaque connexion socket. Un compte supprimé ou modifié perd
ses accès immédiatement.

**Services externes sans compte** : OSRM (distance routière), Nominatim/OpenStreetMap (adresses),
Expo Push.

---

## 3. Les fichiers du cœur métier, et la règle que chacun porte

À lire avant de toucher quoi que ce soit dans ces domaines.

| Fichier | Ce qu'il décide |
|---|---|
| `lib/pricing.js` | Le prix. Ordre : **prix négocié du client → grille de sa municipalité → prix de repli de la destination → rien**. `matchZone` reconnaît la municipalité **dans le texte de l'adresse**. Un zéro n'est jamais un prix. |
| `lib/addressFormat.js` | La forme unique des adresses : « numéro + rue, ville, province + code postal ». **Garde-fou : une mise en forme ne peut jamais changer la municipalité reconnue**, donc jamais le prix. Contient aussi les abréviations (« Boul. » → « Boulevard ») et le niveau de précision d'un point. |
| `lib/rideAddresses.js` | Le seul endroit qui décide de l'adresse et des coordonnées enregistrées, à la création **comme** à la correction d'une course. |
| `lib/ridesOrder.js` | L'ordre des listes de courses et le découpage en journées, **à l'heure du Québec** (`FUSEAU_TAXI`), envoyé déjà calculé aux applications. |
| `lib/rappels.js` | Quand un rappel est dû, et quand l'escalade se déclenche (60 min, chauffeur hors ligne ou pas en route). |
| `lib/accountDeletion.js` | Qui a le droit de supprimer son compte. **Décision du propriétaire : un chauffeur supprime le sien automatiquement, sans aucune vérification.** Un client reste bloqué pendant une course. |
| `lib/deleteUser.js` | La suppression elle-même, en une transaction : courses annulées ou remises au Dispatch, photos effacées, sockets coupés, agendas mis à jour. Le compte Dispatch est protégé partout. |
| `lib/calendar.js` + `lib/rideEmails.js` | Les courriels et l'invitation d'agenda (RFC 5545, UID stable `course-{id}@taxi-sylvain`, SEQUENCE qui s'incrémente). |
| `lib/mailer.js` | L'envoi (Brevo ou Resend). **Ne lève jamais** : un courriel ne doit jamais faire échouer une action. |
| `lib/twilioProxy.js` | L'appel masqué client ↔ chauffeur (Twilio Proxy). Inactif sans clés. |
| `lib/twilioVoice.js` | L'appel vocal de rappel d'urgence (Twilio Voice). Inactif sans clés. |
| `lib/httpSafety.js` | Le filet d'erreurs : une erreur dans une route async n'arrête plus le serveur. |
| `apps/driver-app/src/lib/navigationLinks.js` | Les liens Waze et Google Maps. Guidage direct **seulement** sur un point sûr ; sinon recherche par texte, sans `navigate=yes`, pour que le chauffeur voie les résultats. Fichier pur, testé côté serveur. |
| `lib/verification.js` | La confirmation du courriel par code à six chiffres : qui doit confirmer (jamais le Dispatch, jamais un compte sans vrai courriel, personne si les courriels ne sont pas configurés), validité 15 minutes, 5 essais, renvoi après une minute. Le code n'est jamais gardé en clair. Les routes sont dans `routes/auth.js` (`/register`, `/login`, `/verify-email`, `/resend-code`, `/confirm-email/:userId`). |
| `lib/webPush.js` + `lib/push.js` | Les notifications : Expo Push pour les applications installées, Web Push (clés VAPID, service worker `public/sw.js` des trois sites) pour les versions web. Chaque envoi part par les deux voies ; un jeton ou un abonnement périmé est effacé. Inactif sans clés, jamais bloquant. |
| `lib/notation.js` | Les courses terminées qu'il reste à noter (7 jours), proposées à l'ouverture des applications. |
| `jobs/weeklyReport.js` | Les bornes de la semaine du récap, **à l'heure du Québec** (lundi 00 h 00 → dimanche 23 h 59), et le courriel de récap au chauffeur. |
| `apps/dispatch-web/src/lib/coursesFilter.js` | Recherche, filtres et pagination de la page Courses de la console. Fichier pur, testé côté serveur. |

---

## 4. Déploiement

Les outils `railway`, `vercel` et `eas` sont connectés sur le PC du propriétaire.

```bash
# Serveur (toujours depuis backend/ : à la racine, la CLI est liée à un service parasite)
cd backend && railway up --service backend --detach
railway logs --service backend        # attendre « Taxi Sylvain API en écoute »

# Console Dispatch
cd apps/dispatch-web && vercel --prod --yes

# Application chauffeur (version web)
cd apps/driver-app && vercel --prod --yes

# Application client (version web) — PIÈGE : l'ancienne adresse ne suit pas toute seule
cd apps/client-app && vercel --prod --yes
vercel alias set <adresse-du-nouveau-deploiement> taxi-sylvain-client.vercel.app

# Vérification obligatoire après chaque mise en ligne
node scripts/verifier-mise-en-ligne.mjs
```

Le démarrage du serveur exécute `prisma migrate deploy` : **une migration mal écrite empêche le
serveur de démarrer**. Inversement, si le serveur répond, c'est que les migrations sont passées.

**Compilation des applications** (accord du propriétaire obligatoire) :
```bash
export EXPO_TOKEN=...        # lu depuis C:\Users\PC\cles-taxi-sylvain\cles.txt
cd apps/driver-app && npx eas-cli build --platform android --profile preview --non-interactive --no-wait
cd apps/client-app && npx eas-cli build --platform android --profile preview --non-interactive --no-wait
```
Le profil `production` (App Bundle `.aab` pour Google Play, build iOS) existe aussi dans les deux
`eas.json`, avec les identifiants Apple dans `submit.production.ios`.

---

## 5. Ce qui a été demandé, et ce qui a été livré

### Livré et vérifié

**Courses** — Création par le Dispatch ou par le client ; réservation par téléphone avec création
de la fiche client à la volée ; heure planifiée dans le bon fuseau ; numéro de vol ; étapes
imposées dans l'ordre (acceptée → en route → démarrée → terminée) ; annulation par le chauffeur
qui remet la course au Dispatch ; course de dernière minute diffusée à tous, premier arrivé premier
servi ; refus mémorisé ; historique paginé ; notation dans les deux sens.

**Tarifs** — Grille de 115 municipalités vers YUL et YHU, reconnaissance de la municipalité dans
l'adresse (y compris les pièges : « Québec » province contre ville, « Saint-Jean-sur-Richelieu »
contre « Saint-Jean ») ; destinations prédéfinies avec prix de repli ; **prix négocié par client**
(20 septembre) ; le montant envoyé par l'application d'un client n'est jamais retenu.

**Suivi** — Position du chauffeur en direct, carte côté Dispatch et côté client, suivi qui continue
en arrière-plan, salle de course fermée aux tiers, ancien chauffeur éjecté immédiatement.

**Messagerie** — Client ↔ chauffeur sans échange de numéros, règle d'une heure avant la course, fil
direct Dispatch ↔ chauffeur, groupes, non-lus, sons.

**Courriels et agenda** — Confirmation et annulation avec invitation d'agenda ; rappel 80 minutes
avant ; escalade d'urgence à 60 minutes. Brevo branché et vérifié le 20 septembre (envoi reçu).

**Cédule et argent** — Cédule de la semaine, triée par heure dans chaque journée ; revenus ;
récapitulatif hebdomadaire automatique avec la redevance de 10 %, exportable en PDF et Excel ;
exports et imports de clients et de chauffeurs.

**Comptes** — Inscription du client depuis l'application (20 septembre) ; création de chauffeurs et
de clients par le Dispatch avec mot de passe temporaire ; permissions par collaborateur ;
suppression de compte par la personne elle-même (client et chauffeur), dans l'application et sur
une page web publique.

**Conformité** — Politique de confidentialité, conditions d'utilisation et page de suppression, en
ligne, écrites puis **vérifiées phrase par phrase contre le code** (33 écarts trouvés et corrigés).

### Corrections du 20 septembre (demande du propriétaire, dix points)

1. Cédule triée par heure, courses et créneaux fusionnés ; changement d'heure corrigé.
2. Courses des applications regroupées par jour et classées par heure.
3. Waze et Google Maps ouvrent au bon endroit (deux causes : adresse trop longue, `navigate=yes`).
4. Recherche de client dans la console.
5. Courriel de rappel 80 minutes avant.
6. Notifications et sons fiabilisés (délai maximal, verrou, lecture des erreurs).
7. Escalade à 60 minutes : appel vocal, notification, son, courriel, alerte au Dispatch.
8. Trois tarifs YUL/YHU/REM modifiables sur la fiche client.
9. Saisie intuitive d'adresses partout.
10. Forme unique des adresses, avec garde-fou tarifaire.

### Reprise du 20 septembre (après-midi) : ce que le plan de révision a fait livrer

- **Confirmation du courriel par code** (demande du propriétaire) : inscription dans l'app,
  chauffeurs et clients créés par le Dispatch, collaborateurs. Code à six chiffres gardé en
  empreinte, 15 minutes, 5 essais, renvoi après une minute ; aucune session tant que le code n'est
  pas saisi ; écran dédié dans les deux applications et dans la console ; le Dispatch peut confirmer
  à la main depuis les fiches. Comptes existants confirmés d'office. Règles dans
  `backend/src/lib/verification.js` (13 tests).
- **Notifications des versions web** : service worker et Web Push (clés VAPID) dans les trois
  sites ; Android Chrome affiche enfin les notifications, même onglet fermé. `backend/src/lib/webPush.js`.
- **Défauts de la revue corrigés** : semaine du récap et tâches planifiées à l'heure du Québec ;
  correction de course qui ne fait plus sonner le chauffeur comme une nouvelle affectation ; client
  prévenu (son, notification) quel que soit l'écran ouvert ; réabonnement au suivi après une
  coupure ; jetons push périmés effacés ; canal Android « urgence » ; son iPhone en mode silencieux.
- **Confort** : accueil des applications trié (à prendre, à faire par heure, historique après) ;
  notation à rattraper proposée à l'ouverture ; sélecteur de date natif dans l'app client ; page
  Courses de la console avec recherche, filtres et pagination ; récap hebdomadaire envoyé par
  courriel aux chauffeurs ; script de remise en forme des adresses existantes.
- **Preuves** : 232 tests (au lieu de 201), scénario local de 32 vérifications
  (`05-Verifications/scenario-vague-20-sept.cjs`), exports web des trois sites reconstruits.

---

## 6. Rapport de vérification (20 septembre 2026)

### Méthode

Une vérification complète a été menée par une équipe d'agents indépendants : un inventaire des
demandes écrites, douze vérificateurs (un par domaine fonctionnel), puis **un sceptique par
domaine chargé de contredire les conclusions**, preuve à l'appui. Environ 215 éléments ont été
examinés, dans le code et, quand c'était observable, en production.

### Résultats

| État | Nombre | Lecture |
|---|---|---|
| Fonctionne, prouvé | 60 | vérifié dans le code **et** par un test ou une observation |
| Fonctionne sur le web seulement | 21 | livré, mais absent des téléphones tant qu'on ne recompile pas |
| Partiel | 106 | fonctionne avec une réserve écrite (souvent : non couvert par un test, ou dépendant d'un compte) |
| En attente d'un compte fournisseur | 15 | code écrit, clé manquante |
| Absent | 23 | pas encore construit |

Le détail par domaine est dans les fichiers de vérification conservés avec le projet.

### Défauts graves trouvés et corrigés

- **Le serveur s'arrêtait** sur une simple requête anonyme mal formée (`/login` avec un mot de
  passe numérique). Corrigé : filet d'erreurs global, contrôle des types.
- **Envoi de photos piégeable** : un fichier `.html` pouvait être écrit hors du dossier prévu.
  Corrigé : droits vérifiés avant écriture, nom et extension fabriqués par le serveur.
- **Un jeton restait valable 30 jours** même après suppression du compte ou retrait de permissions.
  Corrigé : relecture en base à chaque requête.
- **Le suivi d'une course était ouvert à tout compte connecté.** Corrigé.
- **Le montant envoyé par l'application d'un client était facturé tel quel** : l'ancienne version
  envoyait 20 $ en dur. Corrigé le 20 septembre.
- **Une course déplacée ne redéclenchait plus jamais ses rappels.** Corrigé.
- **Les pages légales affirmaient des choses fausses** (33 écarts). Réécrites et vérifiées.

### Ce que la vérification n'a pas pu couvrir

- Aucun test automatique sur les interfaces : tout ce qui est « écran » est vérifié à la main.
- Le comportement réel sur un téléphone Android ou iPhone (notifications, GPS en arrière-plan,
  ouverture de Waze) n'a pas pu être observé : il n'y a pas d'appareil de test.
- Le dernier agent de synthèse de la vérification n'a pas pu terminer (limite d'usage atteinte) :
  la liste des « éléments que personne n'a regardés » reste donc à produire.

---

## 7. Ce qui reste à finaliser

### A. Bloqué par le propriétaire (aucune ligne de code à écrire)

| Élément | Ce qu'il doit faire | Ce qui se débloque |
|---|---|---|
| **Twilio** | Identifiants, numéro canadien, service Proxy, et un numéro sortant pour l'appel de rappel | Appel masqué client ↔ chauffeur, appel de rappel d'urgence |
| **Connexion Apple** | `eas build --platform ios` en mode interactif, une fois, pour créer le certificat | Toute version iPhone |
| **Compte Google Play d'entreprise** | Créer, payer 25 USD, vérification d'identité | Publication sur le Play Store |
| **Adresse postale et raison sociale** | Les fournir | Exigées par la Loi 25 dans les pages légales, et par Apple |
| **Relecture juridique des conditions** | Faire relire | Un avis le signale en haut de la page |
| **Prix REM, règle Plattsburgh** | Saisir dans la page Tarifs, décider la règle | Tarification complète |
| **Boîte courriel `reservations@taxisylvain.ca`** | La créer chez l'hébergeur | Les réponses des clients n'arrivent nulle part aujourd'hui |

### B. Décisions d'entreprise en attente

1. **Portée du prix négocié** : il s'applique à toutes les courses du client, même hors de son
   domicile. Le prix de grille est affiché en regard pour que le Dispatch voie la différence.
2. **Qui peut fixer un prix** : aujourd'hui, seul un compte autorisé aux « Courses ». Un
   collaborateur autorisé aux « Clients » peut corriger une fiche, pas un tarif.
3. **Onglet « Courses passées »** : classé par journée la plus récente d'abord, et heures
   croissantes à l'intérieur. À confirmer.

### C. À construire

- **Recompilation des deux APK** (accord du propriétaire) : depuis les APK 1.2.0 du 20 septembre
  au matin, cinq changements n'existent que sur le web : écran du code de confirmation, sélecteur
  de date natif (app client, nouvelle dépendance native `@react-native-community/datetimepicker`),
  canal Android « urgence », son en mode silencieux iPhone, réabonnement au suivi après coupure.
- **Version iPhone** : jamais compilée.
- **Courriels à chaque étape** (en route, démarrée, terminée) : seules la confirmation, l'annulation,
  les rappels, le code de confirmation et le récap hebdomadaire partent.
- **Dépôt des documents des chauffeurs** (permis, assurance) dans l'application.
- **Paiement en ligne** : aucun paiement ne passe par l'application (choix actuel).
- **Réglage du volume des alertes sonores** : annoncé fait autrefois, introuvable dans le code.
- **Environnement d'essai séparé**, alerte automatique d'erreurs (Sentry), tests de parcours sur
  les interfaces, sauvegardes de base vérifiées.
- **Remise en forme des adresses déjà enregistrées** : le script existe
  (`backend/scripts/reformater-adresses.mjs`, simulation par défaut, refuse une base distante sans
  `--production`). Il reste à le lancer une fois sur la production, après lecture de la simulation.

---

## 8. Comptes externes : ce qui existe, comment s'y connecter

> **Aucun mot de passe ni clé ne figure dans ce document.** Les secrets sont sur le PC du
> propriétaire, dans `C:\Users\PC\cles-taxi-sylvain\cles.txt` (BREVO_API_KEY, TWILIO_*, EXPO_TOKEN)
> et dans les fichiers du même dossier. Ils ne doivent jamais entrer dans le dépôt ni dans une
> conversation.

| Service | À quoi il sert | État | Comment s'y connecter et continuer |
|---|---|---|---|
| **GitHub** | Dépôt privé `paulemileverges-star/taxi-sylvain`, branche `master` | ✅ en place | `git push origin master` depuis le PC. L'écrasement forcé est interdit par `.claude/settings.local.json`. |
| **Railway** | Serveur + base PostgreSQL + photos (volume `/app/uploads`) | ✅ payant, actif | CLI `railway` déjà connectée. **Toujours lancer depuis `backend/`.** Variables d'environnement : `railway variables --service backend`. |
| **Vercel** | Les trois interfaces web + **registraire et DNS du domaine** | ✅ actif | CLI `vercel` connectée, équipe `taxi-sylvain`. DNS : `vercel dns ls taxisylvain.ca`, `vercel dns add …`. |
| **Domaine `taxisylvain.ca`** | Acheté chez Vercel le 19 septembre, renouvellement ~17 USD/an | ✅ actif | Sous-domaines : `api.` → Railway ; `dispatch.`, `chauffeur.`, `client.` → Vercel ; racine et `www.` → hébergement LWS (site WordPress). |
| **LWS** | Hébergement du site vitrine WordPress | ✅ payant | Panneau `panel.lws.fr`. `taxisylvain.ca` y est un **domaine externe** : le DNS reste chez Vercel, seuls les enregistrements A et AAAA pointent vers le serveur LWS. WordPress reste à installer dans l'espace du domaine. |
| **Brevo** | Envoi des courriels (confirmations, rappels, agenda) | ✅ gratuit, actif | `app.brevo.com`. Domaine `taxisylvain.ca` authentifié (DKIM, DMARC, brevo-code déjà posés dans le DNS Vercel). Expéditeur : `reservations@taxisylvain.ca`. Variables Railway : `BREVO_API_KEY`, `MAIL_FROM`. |
| **Expo / EAS** | Compilation des applications, notifications push | ✅ compte gratuit | Équipe `taxisylvains-team`, projets `taxi-sylvain-chauffeur` et `taxi-sylvain-client`. Se connecter avec `EXPO_TOKEN` (dans `cles.txt`) ou `npx eas-cli login`. Variables de fichier déjà créées : `GOOGLE_SERVICES_JSON`, `GOOGLE_SERVICE_INFO_PLIST`. |
| **Firebase** | Notifications push Android/iOS | ✅ **complet le 20 septembre** | Projet `taxi-sylvain` sur `console.firebase.google.com`. Fichiers `google-services.json` et `GoogleService-Info.plist` dans chaque application (exclus de Git) et dans les variables EAS. **Clé de compte de service déposée sur Expo et rattachée aux deux applications** (`firebase-adminsdk-fbsvc@taxi-sylvain.iam.gserviceaccount.com`), vérifiée directement auprès de Google. |
| **Apple Developer** | Version iPhone, TestFlight, App Store | ⚠️ inscrit, certificat manquant | Team ID `DNB64CQYH6`, clé App Store Connect `2D3MR539UF`, Issuer ID `cf6fb73d-076c-4bb1-819e-b8179ebb5461` (ces trois-là ne sont pas secrets). Le fichier `.p8` est dans le dossier des clés. **Reste : une connexion Apple interactive pour créer le certificat de distribution.** |
| **Google Play** | Publication Android | ❌ à créer | `play.google.com/console/signup`, compte **d'entreprise** (25 USD, numéro D-U-N-S en main). |
| **Twilio** | Appel masqué et appel de rappel | ⚠️ compte créé et payé, **rien de branché** | `console.twilio.com`. Reste : acheter un numéro canadien, créer le service Proxy, et renseigner `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PROXY_SERVICE_SID`, `TWILIO_CALLER_NUMBER` dans Railway. |
| **D-U-N-S** | Exigé par Google et Apple pour un compte d'entreprise | ✅ obtenu | — |
| **OpenStreetMap / OSRM** | Adresses, cartes, distances | ✅ gratuit, sans compte | Aucun compte. Respecter la limite d'une requête par seconde. |

**Raison sociale du compte Brevo** : Groupe NSK Inc. À confirmer avant de l'écrire dans les pages
légales.

---

## 9. Pièges connus, à ne pas redécouvrir

1. **Le prix se lit dans le TEXTE de l'adresse.** Toute réécriture d'adresse peut changer un
   montant facturé. Le garde-fou de `addressFormat.js` l'interdit : ne pas le contourner.
2. **`GET /rides` sans paramètre** est partagé par la console, l'application chauffeur et
   l'application client. En changer l'ordre retourne silencieusement trois écrans.
3. **L'adresse publique de l'application client ne suit pas les déploiements.** `vercel alias set`
   après chaque `vercel --prod`, puis le script de vérification.
4. **Railway depuis la racine** est lié à un service parasite en échec. Toujours depuis `backend/`.
5. **Les heredocs du terminal mangent les antislashs.** Écrire le code avec l'outil d'édition, pas
   avec `cat <<EOF`.
6. **`node --test test/` échoue sous Windows** : utiliser `node --test "test/**/*.test.js"`.
7. **Une journée est une notion de fuseau horaire.** Le serveur découpe à l'heure du Québec et
   envoie le jour déjà calculé : ne pas recalculer les dates dans les applications.
8. **Expo répond « ok » même quand chaque notification échoue.** Lire le détail de la réponse.
9. **Les courses terminées sont des pièces comptables** (redevance de 10 %) : ne jamais les
   modifier, même pour « corriger » une adresse.

---

## 10. Par où commencer, concrètement

```bash
git clone https://github.com/paulemileverges-star/taxi-sylvain.git
cd taxi-sylvain/backend
cp .env.example .env        # renseigner DATABASE_URL (base locale) et JWT_SECRET
npm install && npx prisma migrate dev
npm test                    # 201 tests doivent passer
npm run dev                 # http://localhost:4000
```

Puis lire, dans cet ordre :
1. ce document ;
2. `docs/PASSATION.md` (§ 11 : le registre de toutes les demandes du propriétaire et leur état) ;
3. `AGENTS.md` et `CLAUDE.md` (les règles courtes, dans le dépôt) ;
4. `backend/src/lib/pricing.js` et `backend/src/lib/addressFormat.js` — c'est là que se trouve
   l'argent.

**La première chose à faire**, si le propriétaire ne dit pas autre chose : brancher Twilio (numéro
canadien, service Proxy, numéro sortant) puis faire créer le certificat Apple. Ce sont les deux
derniers points qui n'attendent aucune ligne de code.

À vérifier en priorité sur un vrai téléphone Android : qu'une notification arrive bien. La clé
Firebase a été déposée et vérifiée auprès de Google le 20 septembre, mais aucune notification n'a
encore été reçue sur un appareil réel — il n'y en a pas au banc d'essai.

---

*Document produit le 20 septembre 2026. Preuves à l'appui : 201 tests automatiques, 18 vérifications
de parcours sur un serveur d'essai, contrôle des 14 points publics en ligne, et une vérification
contradictoire de l'ensemble du projet par une équipe d'agents indépendants.*
