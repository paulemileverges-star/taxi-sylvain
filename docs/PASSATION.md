# Passation du projet Taxi Sylvain

Document de reprise pour tout assistant ou développeur qui continue le projet. Il décrit l'état réel au
**18 septembre 2026** (commit `9886d2b` et suivants), la façon de travailler avec le propriétaire, les
procédures de déploiement, les règles métier à ne pas casser et tout ce qui reste à faire.

Lire aussi : `AGENTS.md` (règles courtes), `docs/ARCHITECTURE.md` (choix techniques d'origine),
`backend/.env.example` (variables d'environnement commentées).

---

## 1. Le propriétaire et la façon de travailler avec lui

- **Qui** : propriétaire de Taxi Sylvain (taxi et transferts aéroport, Rive-Sud de Montréal, Longueuil) et de
  Neomoov (SaaS taxi/VTC). Il n'est pas développeur. Il délègue entièrement et teste lui-même, en
  production, avec de vrais chauffeurs et de vrais clients.
- **Langue** : tout en français. Messages courts, sans jargon. Il veut des liens, des APK, des PDF.
- **Ce qu'il a reproché** (17 septembre) : « trop d'erreurs, de bugs, d'omissions ». Deux causes réelles :
  une correction avait cassé le suivi GPS sans que personne ne le voie pendant une semaine, et le lien public
  de l'app client servait une version vieille de neuf jours (voir § 8). Conséquence :
  - ne jamais annoncer « c'est corrigé » sans preuve ;
  - rendre compte **point par point** : fait et vérifié comment, ou pas fait et pourquoi ;
  - lancer les tests et le script de vérification avant toute annonce (§ 5) ;
  - ajouter un test pour chaque règle métier qu'il demande, pour qu'elle ne se reperde pas.
- **Contrainte récurrente** : pour les corrections, il demande souvent « côté web uniquement, les APK ne
  bougent pas ». Ne jamais relancer une compilation Android/iOS sans son accord explicite.
- **Actions irréversibles** (supprimer un projet, un service, un volume, des données) : toujours lui demander.

---

## 2. Liens de production

Depuis le 19 septembre, les adresses officielles sont sur le domaine `taxisylvain.ca` (voir § 6 bis). Les
anciennes adresses en `vercel.app` et `railway.app` continuent de fonctionner. Les versions web publiées et
les APK installés appellent encore l'API par son adresse `railway.app` : ils passeront à `api.taxisylvain.ca`
à leur prochaine publication (variables Vercel `VITE_API_URL` et `EXPO_PUBLIC_API_URL` à changer à ce
moment-là) ou recompilation (déjà prévu dans `eas.json`).

| Élément | Adresse officielle | Ancienne adresse, toujours active |
|---|---|---|
| Console Dispatch | https://dispatch.taxisylvain.ca | https://taxi-sylvain-dispatch.vercel.app |
| App Chauffeur, version web | https://chauffeur.taxisylvain.ca | https://taxi-sylvain-driver.vercel.app |
| App Client, version web | https://client.taxisylvain.ca, https://taxisylvain.ca, https://www.taxisylvain.ca | https://taxi-sylvain-client.vercel.app |
| API | https://api.taxisylvain.ca/api | https://backend-production-03f0b.up.railway.app/api |
| Santé de l'API | https://api.taxisylvain.ca/health | https://backend-production-03f0b.up.railway.app/health |
| Téléphone de réservation | 438-499-1120 | |

APK Android : produits par EAS Build, profil `preview`. Derniers APK : **1.4.0 (versionCode 6, Expo SDK 54), compilés le
23 septembre à 20 h** (avec les fichiers Firebase ; compilations EAS `2a4b9b26` chauffeur et `330d5bfa` client), rangés dans le dossier de passation OneDrive
`01-Applications/Android` avec les liens d'installation (`Liens-de-telechargement.txt`). Ils embarquent
`api.taxisylvain.ca`. Tout ce qui sera livré après n'existe que sur les versions web tant qu'on ne recompile pas.

Depuis le 20 septembre, les deux APK sont aussi servis par le serveur lui-même, sur le disque persistant
(`/app/uploads/apk/`, déposés par `railway ssh` avec un téléchargement Node depuis les artefacts Expo) :
`https://api.taxisylvain.ca/uploads/apk/Taxi-Sylvain-Chauffeur-1.4.0.apk` et
`https://api.taxisylvain.ca/uploads/apk/Taxi-Sylvain-Client-1.4.0.apk` (type `application/vnd.android.package-archive`,
65 à 68 Mo chacun ; les fichiers 1.3.x ont été retirés du volume le 23 septembre, archivés dans OneDrive). **Liens définitifs depuis le 23 septembre** : `https://api.taxisylvain.ca/telecharger/chauffeur.apk` et
`https://api.taxisylvain.ca/telecharger/client.apk` (route `GET /telecharger/:application.apk` dans `index.js`, règle
`lib/apkLatest.js` testée : redirection 302 vers le fichier `Taxi-Sylvain-<App>-<x.y.z>.apk` de plus haute version présent
dans `uploads/apk/`). Ce sont les liens à donner aux chauffeurs et aux clients ; ils ne changent jamais. À chaque nouvelle
version : déposer les nouveaux fichiers (`railway ssh`, script `dl-apk.js` du dossier OneDrive `07-Outils`), supprimer les
anciens, mettre à jour `Liens-de-telechargement.txt`. Liens iPhone définitifs (TestFlight) : chauffeur
`https://testflight.apple.com/join/Fd6W5dCv`, client `https://testflight.apple.com/join/YecvTgPW`. À supprimer du volume quand le Play Store prendra le relais.

---

## 3. Architecture et organisation du dépôt

```
backend/              API Node.js/Express + Socket.io, Prisma + PostgreSQL
  prisma/schema.prisma      modèle de données (17 migrations, appliquées au démarrage)
  src/index.js              serveur, routes, tâches planifiées, diagnostics au démarrage
  src/routes/               rides, messages, clients, drivers, admins, pricing, destinations,
                            conversations, schedule, reports, ratings, geocode, suggestions, auth
  src/lib/                  pricing, calendar (.ics), mailer, rideEmails, push (Expo), distance (OSRM),
                            driverLocations, uploads, seedDestinations, seedPricing, twilioProxy...
  src/jobs/                 rideReminders (chaque minute), weeklyReport (lundi 00 h 05)
  test/                     tests node --test
apps/dispatch-web/    console Dispatch, React + Vite
apps/driver-app/      app chauffeur, React Native 0.81 / Expo SDK 54 (APK + version web react-native-web)
apps/client-app/      app client, React Native 0.81 / Expo SDK 54 (APK + version web react-native-web)
scripts/              verifier-mise-en-ligne.mjs
docs/                 ARCHITECTURE.md, PASSATION.md (ce document)
```

**Temps réel** : salles Socket.io `dispatch` (Dispatch et Admins), `drivers`, `driver:{id}`, `client:{id}`,
`ride:{id}`. Le helper `personalRoom(user)` dans `backend/src/lib/rooms.js` donne la salle personnelle.

**Rôles** : `CLIENT`, `DRIVER`, `DISPATCH` (le propriétaire, accès total), `ADMIN` (collaborateur avec
`permissions` : courses, schedule, drivers, clients, reports, groups). Middleware
`requirePermission(permission, ...rolesSupplémentaires)`. Le JWT contient `id`, `role`, `name`,
`permissions`.

**Services externes sans compte** : OSRM (distance routière), Nominatim/OpenStreetMap (géocodage,
suggestions d'adresses), Expo Push.

---

## 4. Installer et lancer en local (Windows, VS Code)

Prérequis : Node.js 20 ou plus, Git, PostgreSQL local ou une base de test. Ouvrir le dossier racine
`taxi-sylvain` dans VS Code : les extensions recommandées et les tâches sont dans `.vscode/`.

```bash
# API
cd backend
cp .env.example .env        # renseigner DATABASE_URL et JWT_SECRET
npm install
npx prisma migrate dev
npm run dev                 # http://localhost:4000

# Console Dispatch
cd apps/dispatch-web
npm install
npm run dev                 # http://localhost:5173, VITE_API_URL par défaut = localhost:4000/api

# Apps Expo
cd apps/driver-app          # ou apps/client-app
npm install
npx expo start              # touche w pour la version web
```

**Ne jamais pointer un environnement local vers la base de production.** Il n'existe pas encore
d'environnement de test séparé (voir § 10).

Les fichiers `.env`, `.env.local` et `.vercel/` sont ignorés par Git. Aucun secret ne doit être commité.

---

## 5. Tests et vérification, à faire avant chaque annonce

```bash
cd backend && npm test                       # 40 tests, quelques secondes
node scripts/verifier-mise-en-ligne.mjs      # à la racine, après chaque déploiement
```

- `backend/test/calendar.test.js` : invitations d'agenda (UID stable, SEQUENCE, annulation, repliement 75 octets).
- `backend/test/mailer.test.js` : envoi Brevo/Resend avec `fetch` simulé, pannes du fournisseur.
- `backend/test/rideEmails.test.js` : contenu des courriels, fuseau horaire, jamais de courriel fictif.
- `backend/test/rules.test.js` : règle d'une heure des messages chauffeur, reconnaissance des municipalités,
  tarifs YUL/YHU/REM.

Le script de vérification contrôle que l'API répond et que **chaque lien public sert la même version que la
production**. Il a été écrit après l'incident du lien figé (§ 8). Code de sortie 0 = tout est à jour.

Il n'y a pas encore de tests de bout en bout sur les interfaces (voir § 10).

---

## 6. Déploiement

Les outils `railway`, `vercel` et `eas` sont connectés sur le PC du propriétaire avec ses comptes.

### API (Railway)

```bash
cd backend
railway up --service backend --detach
railway logs --service backend               # attendre « Taxi Sylvain API en écoute »
```

- Depuis le 23 septembre, la racine du dépôt et `backend/` sont toutes deux liées au bon projet (id `24c08cdf…`,
  service `backend`). Le compte Railway contient un second projet, lui aussi nommé `taxi-sylvain`, vide et en
  échec (créé par erreur, § 8) : si `railway status` affiche un service `taxi-sylvain` sans `backend`, relier avec
  `railway link --project 24c08cdf-1275-41a8-8f46-a1ad1052f8bb --environment production --service backend`.
- **Lancer un script sur la base de production** (la base n'est joignable que depuis Railway, hôte
  `postgres-9vej.railway.internal`) : `railway ssh --service backend -- sh -c "cd /app && node scripts/<script>.mjs"`.
  Prérequis, faits le 20 septembre : une clé SSH locale (`C:\Users\PC\.ssh\id_ed25519`, sans mot de passe,
  commentaire `taxi-sylvain-railway`) enregistrée chez Railway sous le nom `pc-taxi-sylvain`
  (`railway ssh keys add --key taxi-sylvain-railway`), le bloc de configuration écrit par
  `railway ssh config --service backend --alias taxi-sylvain-backend` dans `~/.ssh/config`, et l'empreinte de
  `ssh.railway.com` dans `~/.ssh/known_hosts` (`ssh-keyscan ssh.railway.com >> ~/.ssh/known_hosts`), sinon
  « Host key verification failed ».
- Le démarrage exécute `prisma migrate deploy` : une migration mal écrite bloque la mise en ligne.
- Diagnostics affichés au démarrage : nombre de photos dans `/app/uploads` et état des courriels.
- Projet Railway `taxi-sylvain` (id `24c08cdf-1275-41a8-8f46-a1ad1052f8bb`), service `backend`, base
  `Postgres-9vEj`. Volume `backend-volume` monté sur `/app/uploads` pour les photos.

### Console Dispatch (Vercel)

```bash
cd apps/dispatch-web
vercel --prod --yes
```

Le projet Vercel `taxi-sylvain-dispatch` publie directement sur https://taxi-sylvain-dispatch.vercel.app.

### App Chauffeur, version web (Vercel)

```bash
cd apps/driver-app
vercel --prod --yes
```

Projet `taxi-sylvain-driver`, publie directement sur https://taxi-sylvain-driver.vercel.app.

### App Client, version web (Vercel) — PIÈGE

```bash
cd apps/client-app
vercel --prod --yes                          # noter l'adresse « Production » affichée
vercel alias set <adresse-du-nouveau-deploiement> taxi-sylvain-client.vercel.app
node ../../scripts/verifier-mise-en-ligne.mjs
```

Le dossier est lié au projet Vercel `client-app`, dont le domaine naturel est
`client-app-nine-pi.vercel.app`. Le lien donné au propriétaire, `taxi-sylvain-client.vercel.app`, est un
**alias posé à la main sur un déploiement précis** : il ne suit pas les nouvelles versions. Sans le
`vercel alias set`, le propriétaire continue de tester l'ancienne version. Un ancien projet Vercel vide nommé
`taxi-sylvain-client` existe aussi : ne pas l'utiliser.

**Depuis le 19 septembre, le piège ne touche plus que l'ancienne adresse.** `client.taxisylvain.ca`,
`taxisylvain.ca` et `www.taxisylvain.ca` sont des domaines du projet `client-app` : ils suivent
automatiquement chaque mise en production, sans `vercel alias set`. L'alias reste à refaire uniquement pour
que `taxi-sylvain-client.vercel.app` suive aussi.

### 6 bis. Domaine taxisylvain.ca

- Acheté le 19 septembre 2026 chez **Vercel**, qui est à la fois registraire et serveur DNS
  (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`), équipe Vercel `taxi-sylvain`. Renouvellement le 19 septembre
  2027, 16,99 USD.
- Les enregistrements se gèrent en ligne de commande : `vercel dns ls taxisylvain.ca`,
  `vercel dns add taxisylvain.ca <nom> <type> <valeur>`.
- Les sous-domaines web sont couverts par l'enregistrement générique de Vercel ; il suffit de rattacher
  l'adresse au bon projet : `vercel domains add <adresse> <projet>`.
- `api.taxisylvain.ca` : domaine personnalisé du service Railway `backend`, avec un enregistrement `CNAME api`
  vers la cible donnée par Railway et un enregistrement `TXT _railway-verify.api` de vérification.
- **À venir** : les enregistrements de Brevo pour l'envoi des courriels, dès que le compte existera, et une
  adresse de contact sur ce domaine pour les pages de confidentialité et le compte Apple d'entreprise.

### APK Android (EAS Build)

```bash
cd apps/driver-app                           # puis apps/client-app
eas build --platform android --profile preview
```

- Équipe Expo `taxisylvains-team`. Identifiants Android : `com.taxisylvain.driver` et
  `com.taxisylvain.client` (les mêmes servent d'identifiants iOS).
- Le quota gratuit était épuisé jusqu'au 1er octobre 2026 ; le propriétaire envisage le forfait Starter.
- Les URL de l'API sont injectées par `eas.json` (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SOCKET_URL`). Depuis
  le 19 septembre, elles pointent vers `https://api.taxisylvain.ca` : les prochains APK ne dépendront plus
  de l'adresse générée par Railway. Les APK déjà installés gardent l'ancienne adresse, qui reste active.
- **Uniquement avec l'accord du propriétaire.**

---

## 7. Variables d'environnement (noms seulement, jamais les valeurs)

| Où | Variables |
|---|---|
| Railway, service backend | `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `PORT` ; optionnelles : `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PROXY_SERVICE_SID`, `TWILIO_CALLER_NUMBER`, `BREVO_API_KEY` ou `RESEND_API_KEY`, `MAIL_FROM`, `DRIVER_APP_URL`, `CLIENT_APP_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (notifications Web Push des versions web, déposées le 20 septembre ; la paire de clés est dans `C:\Users\PC\cles-taxi-sylvain\vapid-web-push.json`) |
| Vercel, dispatch | `VITE_API_URL`, `VITE_SOCKET_URL` |
| Vercel, driver et client | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SOCKET_URL` |
| EAS | définies dans `eas.json`, profil `preview` |

`CORS_ORIGIN` liste les sites autorisés à appeler l'API : les adresses `taxisylvain.ca` (racine, `www`,
`dispatch`, `chauffeur`, `client`), les anciennes adresses `vercel.app` et `http://localhost:5173`. Le code
accepte en plus tout sous-domaine `*-taxi-sylvain.vercel.app`. Une nouvelle adresse web doit y être ajoutée,
sinon l'application s'affiche mais ne peut plus se connecter. Les APK ne sont pas concernés par CORS.
`DRIVER_APP_URL` et `CLIENT_APP_URL` pointent vers `chauffeur.taxisylvain.ca` et `client.taxisylvain.ca`.

---

## 8. Pièges connus et incidents passés

- **Lien client figé** : voir § 6. Toujours réaliaser puis lancer le script de vérification.
- **Suivi GPS cassé par une correction** (corrigé le 17 septembre, `3192b77`) :
  `apps/driver-app/src/lib/locationTracker.js` posait le contexte de course puis appelait la fonction
  d'arrêt, qui l'effaçait ; aucune position n'était envoyée sur la version web. Le suivi est désormais piloté
  dans `App.js` (statuts `EN_ROUTE` et `STARTED`), survit au changement d'écran et reprend après
  rechargement. Ne pas remettre d'arrêt du suivi au démontage d'un écran.
- **Bouton glissant** (`SwipeButton`) : le PanResponder capturait la première version de `onConfirm`. Corrigé
  avec des refs ; ne pas revenir à une fermeture directe.
- **Heure de prise en charge** : un champ `datetime-local` envoyé tel quel était relu en UTC. Utiliser
  `localInputToIso` / `isoToLocalInput`. Fuseau de référence : `America/Toronto`.
- **Adresse client écrasée** : une fiche client gardait une ancienne copie et la réenregistrait. L'adresse ne
  se modifie plus que par le bouton « Modifier ».
- **react-native-web** : `Alert.alert` ne fait rien sur le web (utiliser `src/lib/alert.js`),
  `Linking.canOpenURL` répond toujours vrai, `react-native-webview` n'existe pas.
- **Git Bash sous Windows** : les heredocs peuvent perdre des barres obliques inverses. Pour écrire du code
  contenant `\\`, utiliser l'éditeur plutôt que le shell.
- **Nettoyage en attente, à faire par le propriétaire** : service Railway parasite `taxi-sylvain` en échec
  dans le projet, volume Railway détaché `postgres-volume` de 85 Mo, ancien projet Railway créé par erreur
  (id `7892fb08-d489-4abb-92ed-06418c706281`).

---

## 9. Règles métier à ne pas casser

- **Étapes d'une course**, imposées par le serveur : `ACCEPTED` puis `EN_ROUTE` puis `STARTED` puis
  `COMPLETED`. Annulation possible avant la fin ; une annulation par le chauffeur remet la course sans
  chauffeur, pour réaffectation.
- **Diffusion** : une course `BROADCAST` est proposée à tous ; le premier qui accepte l'obtient. Un refus est
  mémorisé dans `refusedBy` et la course ne revient plus à ce chauffeur.
- **Téléphones** : jamais transmis à l'autre partie. Messagerie interne ; appel masqué via Twilio Proxy,
  **actif depuis le 23 septembre** : bouton « Appeler (votre numéro sera masqué) » chez le chauffeur (course en cours) et
  « Appeler le chauffeur (votre numéro sera masqué) » chez le client (suivi de course), tous deux seulement quand la course est
  `ACCEPTED`, `EN_ROUTE` ou `STARTED` (`CALL_STATUSES` dans `lib/twilioProxy.js`). Le serveur ouvre une
  session Proxy `ride-<id>` (voix seulement, 4 h) et rend le numéro relais `+1 450 912-4572` ; le téléphone
  compose ce numéro et Twilio relie l'autre partie. Rappel vocal d'urgence 60 min avant la course
  (`lib/twilioVoice.js`) : Taxi Sylvain appelle le chauffeur depuis ce même numéro, voix Polly Chantal fr-CA.
- **Messages chauffeur vers client** : autorisés seulement à partir d'une heure avant l'heure prévue, ou dès
  que la course est `EN_ROUTE`, `STARTED` ou `COMPLETED`, ou si la course n'a pas d'heure programmée.
  Le client peut écrire quand il veut. Fonction `driverMayMessageClient` dans `routes/messages.js`, testée.
- **Tarifs** : destinations prédéfinies YUL, YHU, REM (`Destination`), grille par municipalité de départ
  (`PriceZone`, 115 municipalités, colonnes YUL, YHU, REM). Reconnaissance dans `lib/pricing.js` :
  d'abord une partie exacte de l'adresse, sinon la plus longue correspondance ; « Québec » ne compte comme
  ville que suivi de Capitale-Nationale. Un prix de zone manquant retombe sur le prix fixe de la
  destination. Testé dans `rules.test.js`.
- **REM** : la station est celle du **boulevard de Rome à Brossard**, pas Bois-Franc. Les prix REM de la
  grille sont vides tant que le propriétaire ne les saisit pas.
- **Montant** : une réservation client sans tarif de catalogue part à 0, affichée « à confirmer par Taxi
  Sylvain ». Jamais de montant fictif.
- **Courriels fictifs** : un client créé par téléphone sans courriel reçoit une adresse technique en
  `@reservation.taxisylvain.local`. Elle ne doit jamais apparaître dans un export ni recevoir d'envoi
  (`lib/placeholderEmail.js`).
- **Courriels de course** : à l'affectation, à l'acceptation, au changement d'heure, d'adresse, de montant
  ou de vol, à l'annulation et à la suppression. Invitation `.ics` avec UID stable `course-{id}@taxi-sylvain`
  et `Ride.calendarSeq` croissant, pour mettre à jour l'évènement au lieu de le dupliquer. Inactif tant
  qu'aucune clé Brevo ou Resend n'est configurée ; ne doit jamais faire échouer une action.
- **Rappels** : chaque utilisateur choisit ses décalages (1 j, 2 h, 1 h, 30 min, 10 min ; 1 h et 10 min par
  défaut). `SentReminder` empêche les doublons.
- **Redevance** : 10 % par course à Taxi Sylvain (`Ride.royaltyRate`), récapitulatif hebdomadaire par
  chauffeur généré chaque lundi.
- **Admins** : seul le compte `DISPATCH` crée, modifie ou supprime des admins.
- **Suppression de compte** (décision du propriétaire du 20 septembre 2026, qui remplace celle du 19) : un
  client ou un chauffeur ne supprime plus son compte lui-même, il en fait la **demande** (app ou page web
  `/suppression-compte`, mot de passe exigé). Le compte reste utilisable, la demande est annulable, le
  Dispatch la valide (`deleteUserCascade`, courses du client en cours = refus 409) ou la refuse depuis la
  page Suppressions de la console. Réponse promise **sous 30 jours** dans les pages légales. Courriels :
  accusé de réception, alerte au Dispatch, décision. Règles dans `lib/accountDeletion.js`, testées.

---

## 10. Travaux restants

### Bloqués par le propriétaire (comptes à créer)

| Élément | Ce qu'il doit faire | Ce qui se fait ensuite |
|---|---|---|
| GitHub | **fait le 19 septembre** : dépôt privé `paulemileverges-star/taxi-sylvain`, branche `master` suivie par `origin` | envoyer chaque enregistrement avec `git push` ; l'écrasement forcé est interdit dans `.claude/settings.local.json` |
| Nom de domaine | **fait le 19 septembre : `taxisylvain.ca`**, rattaché aux trois sites et à l'API | DNS pour Brevo et courriel pro exigé par Apple, dès l'ouverture de ces comptes |
| Numéro D-U-N-S | **demande envoyée le 19 septembre**, confirmation attendue de Dun & Bradstreet | comptes d'entreprise Google Play et Apple |
| Brevo | **fait le 20 septembre** : compte créé, domaine `taxisylvain.ca` authentifié, `BREVO_API_KEY` et `MAIL_FROM` dans Railway, envoi reçu | rien : courriels de course, de rappel, de code de confirmation et de récap hebdomadaire partent. Le bouton de la page Administrateurs sert de contrôle |
| Firebase | **complet le 20 septembre : clé FCM V1 déposée sur Expo et rattachée aux deux applications, vérifiée auprès de Google.** Projet `taxi-sylvain` créé le 19 septembre, fichiers rangés : `google-services.json` et `GoogleService-Info.plist` dans chaque app (exclus de Git), clé de compte de service dans `C:\Users\PC\cles-taxi-sylvain` | reste : déposer les fichiers dans les variables EAS (`GOOGLE_SERVICES_JSON`, `GOOGLE_SERVICE_INFO_PLIST`, relayées par `app.config.js`) une fois `eas login` fait, et la clé FCM V1 sur expo.dev pour chaque projet, puis recompiler avec accord |
| Expo | **APK 1.3.0 compilés le 20 septembre à 17 h** avec l'accord écrit du propriétaire (16 h 50), via le jeton `EXPO_TOKEN` du dossier des clés (`eas-cli` n'était plus connecté ; le jeton suffit en le passant dans l'environnement). Les fichiers Firebase arrivent par les variables EAS secrètes `GOOGLE_SERVICES_JSON` et `GOOGLE_SERVICE_INFO_PLIST` (présentes pour les deux projets, environnement `preview`) | à chaque nouvelle recompilation : accord du propriétaire, monter `version` et `versionCode` dans les deux `app.json`, `npx eas-cli build --platform android --profile preview --non-interactive --no-wait`, puis ranger les APK et les liens dans le dossier OneDrive |
| Apple Developer | **inscription faite le 19 septembre**. Identifiants (non secrets) : Team ID `DNB64CQYH6`, clé App Store Connect Key ID `2D3MR539UF`, Issuer ID `cf6fb73d-076c-4bb1-819e-b8179ebb5461`. Le fichier de la clé (`AuthKey_2D3MR539UF.p8`, secret) est dans `C:\Users\PC\cles-taxi-sylvain`, jamais dans le dépôt | **Compilations iPhone 1.3.1 (build 5) faites le 23 septembre** sur EAS : chauffeur `2255af9f`, client `952f7e2a`, profils App Store avec `aps-environment` (vérifié dans le fichier). Clé APNs `7853YS72UB` créée par Christopher le 23 septembre (fichier `AuthKey_7853YS72UB.p8` dans `C:UsersPCcles-taxi-sylvain`, jamais dans le dépôt), déposée chez Expo et associée aux deux applications par `07-Outils/expo-cle-push.mjs`. Fiches App Store Connect créées par Christopher le 23 septembre (« Taxi Sylvain Chauffeur » `6815332363`, « Taxi Sylvain » `6815332894`, `ascAppId` dans les deux `eas.json`). Les envois des compilations Expo SDK 51 ont été refusés par Apple (ITMS-90725 : SDK iOS 17.5, alors que Xcode 26 / SDK iOS 26 sont exigés depuis le 28 avril 2026). **Mise à niveau Expo SDK 54 faite le 23 septembre** (branche `sdk-54` fusionnée), compilations 1.4.0 (build 6) sur Xcode 26 : chauffeur `c6742ddd-d9e6-4868-839a-19a00cebcaec`, client `cf31d70e-6eeb-4203-a725-1f30ad0221df`, **toutes deux acceptées par App Store Connect**. TestFlight : groupe interne « Team (Expo) » (Christopher testeur, installation immédiate), groupe externe « Chauffeurs et clients » avec lien public chauffeur `https://testflight.apple.com/join/Fd6W5dCv` et client `https://testflight.apple.com/join/YecvTgPW`. Reste : saisir dans App Store Connect les informations de contact et le compte de démonstration pour l'examen bêta, puis `apple-testflight.mjs --soumettre` (1 à 3 jours d'examen avant que le lien public fonctionne) |
| Google Play | compte d'entreprise, 25 USD | fiches des applications |
| Twilio | **fait le 23 septembre** : compte payant (solde 38,85 USD), numéro canadien `+1 450 912-4572` (voix et SMS), service Proxy `taxi-sylvain` avec ce numéro, les quatre variables `TWILIO_*` déposées sur Railway (journal du serveur : « Appel vocal de rappel : actif ») ; session Proxy d'essai créée puis supprimée avec le code du serveur | essai d'un vrai appel masqué depuis un téléphone (voir § 9, « Téléphones ») ; surveiller le solde Twilio |
| Prix REM | saisir les montants dans la page Tarifs | aucun code à écrire |
| Plattsburgh | dire comment tarifer ce cas qui dépend du départ | modéliser |

### À développer

1. **Suppression de compte** : **depuis le 20 septembre au soir, c'est une demande validée par le Dispatch** (voir § 9, règle « Suppression de compte »). La décision du 19 septembre (suppression automatique du chauffeur) est remplacée. La validation d'un chauffeur reste sans vérification de redevance ; ses courses non terminées repartent chez le Dispatch. Le client, lui, ne peut pas être validé tant qu'une course est acceptée ou en cours.
2. **Politique de confidentialité et conditions d'utilisation** : **publiées le 19 septembre**, **mises à jour le 20 septembre** (demande de suppression sous 30 jours, adresse postale `2060, rue Saint-Georges, Longueuil (Québec) J4K 2C8`, raison sociale « Taxi Sylvain »). Reste : courriel sur taxisylvain.ca quand il existera ; relecture par un juriste.
3. **Préparation des magasins** : voir `docs/CONFORMITE-MAGASINS.md`, qui contient les réponses prêtes au formulaire « Sécurité des données », la justification de localisation en arrière-plan, le scénario de la vidéo Google, la marche à suivre pour le compte de démonstration Apple et les textes de fiche. Profil de compilation `production` (`.aab` pour Google Play, build iOS) **ajouté le 19 septembre** dans les deux `eas.json`, avec les identifiants Apple de `submit.production.ios` ; la localisation en arrière-plan sur iPhone est activée dans `apps/driver-app/app.json` (`isIosBackgroundLocationEnabled`). Aucun build lancé : il faut l'accord du propriétaire.
4. **Tests de bout en bout** : les parcours serveur sont joués par les scénarios du dossier de passation (`05-Verifications`, dont `scenario-vague-20-sept.cjs` : code de confirmation, Web Push, ordre de l'accueil, notation à rattraper, 32 vérifications). Reste : les écrans eux-mêmes, à la main, et sur un vrai téléphone.
5. **Environnement de test séparé** : deuxième service et deuxième base sur Railway, données fictives.
6. **Alerte d'erreurs** : Sentry en version gratuite sur l'API et les trois interfaces.
7. **Sauvegardes de la base** : vérifier et activer les sauvegardes Postgres sur Railway.
8. **Registre des demandes** : tenir à jour la section 11 à chaque nouvelle vague.
9. **Distribuer et tester les APK 1.3.0** (compilés le 20 septembre à 17 h, voir la ligne Expo du tableau ci-dessus) : envoyer les liens aux chauffeurs et clients, puis dérouler sur un vrai téléphone les sections 5.6 à 5.9 du plan de vérification (notification écran verrouillé, GPS avec Waze ouvert, code de confirmation, sélecteur de date).
10. **Remise en forme des adresses déjà enregistrées** : **fait le 20 septembre à 17 h 30** avec l'accord du propriétaire. Script `backend/scripts/reformater-adresses.mjs` (simulation par défaut, refuse une base distante sans `--production`, ne touche jamais une adresse dont la municipalité reconnue changerait). Lancé dans le conteneur Railway : simulation lue (10 adresses à réécrire, 0 refusée), puis application (10 réécrites, 8 fiches clients avec espaces en trop, 2 courses allégées de « Canada » et de la province en toutes lettres), puis contre-simulation (0 à réécrire, 68 propres). À relancer seulement si des adresses anciennes réapparaissent (import).
11. **Courriels à chaque étape de la course** (en route, démarrée, terminée) : non demandés, non faits ; seuls confirmation, annulation, rappels, code et récap partent.

---

## 11. Historique des demandes et état

État au 18 septembre 2026. « Web » signifie livré sur les versions web mais absent des APK du 13 septembre.

### Cahier des charges initial (8 septembre)

| N° | Demande | État |
|---|---|---|
| — | Trois applications : Dispatch, Chauffeur, Client | Fait |
| 1 | Navigation Waze ou Google Maps au choix | Fait |
| 2 | Messagerie sans échange de contacts, appels masqués si possible | Fait (appel masqué actif depuis le 23 septembre, chauffeur → client et client → chauffeur) |
| 3 | Messages chauffeur et client | Fait |
| 4 | Messages Dispatch et chauffeur | Fait |
| 5 | Cédule de la semaine, affectation au chauffeur choisi | Fait |
| 6 | Course de dernière minute diffusée à tous, premier qui accepte | Fait |
| 7 | Le chauffeur voit départ, destination, distance, montant | Fait |
| 8 | Total de la semaine et redevance de 10 % | Fait |
| 9 à 11 | Boutons En route, Démarrer, Terminer avec notification au Dispatch | Fait |
| 12 | Notation dans les deux sens | Fait |
| 13 | Suivi du chauffeur en direct avec photo, voiture et infos | Fait, web ; photos confirmées en production |
| 14 | Recherche clients, chauffeurs, courses | Fait |
| — | Récapitulatif par période, par chauffeur, par client, envoyé chaque semaine | Fait |
| — | Installation hors magasins Android et iPhone | Android fait (APK 1.4.0) ; iPhone sur TestFlight depuis le 23 septembre (1.4.0), lien public actif après l'examen bêta d'Apple |
| — | Réservation dans l'app ou par téléphone | Fait |

### Vagues de corrections

| Date | Demandes | État |
|---|---|---|
| 8 sept. | Mise en ligne, nouveau chauffeur, sons, carte en direct, volume, statut en ligne, revenus réels, mot de passe, déconnexion, retours, fiche de course détaillée, suppressions, groupes, « Bonjour prénom », cédule | Fait |
| 9 sept. | Suggestions d'adresses, Waze et Maps sur le web, mémo client, push, création de client, exports, logo | Fait ; push en attente de Firebase |
| 10 sept. | Les 20 corrections après tests : rappels programmables, imports en masse, pas de courriels fictifs dans les exports, historique paginé, message lié à la course, navigation selon l'étape, Démarrer après En route, notation, reprise de course, affichage téléphone, heure de prise en charge, nouveau client, nouveau chauffeur, diffuser à tous, accès copiables, formulaire client complet, cédule cliquable, admins à permissions, boutons glissants, refus par croix rouge | Fait |
| 13 sept. | Revue complète : faille d'inscription critique fermée, limite de tentatives, CORS, notes contrôlées, ordre des étapes, distance, rapports par client, avis visibles, montant à confirmer, GPS en arrière-plan, refus mémorisés | Fait |
| 16 sept. | Heure décalée, bouton glissant sans rafraîchir, suivi GPS rapide et persistant, notifications sonores et couleurs par statut côté Dispatch | Fait, web |
| 17 sept. | Adresses clients différentes entre Clients et Cédule | Fait, web |
| 17 sept. | Son et push pour tous les destinataires de messages, pastilles de non-lus | Fait, web ; push en attente de Firebase |
| 17 sept. | Catalogue YUL et YHU de 115 municipalités, grille modifiable dans la console | Fait, web |
| 17 sept. | Photos chauffeur et voiture côté client, photo de voiture entière | Fait, web |
| 17 sept. | Suivi carte Dispatch et client | Fait, web |
| 17 sept. | Suppression des groupes | Fait, web |
| 17 sept. | REM boulevard de Rome, colonne REM, trois tarifs sur chaque fiche client | Fait, web ; prix REM à saisir |
| 17 sept. | Saisie intuitive depuis la base dans tous les champs | Fait, web |
| 17 sept. | Date et heure de réservation côté client | Fait, web |
| 17 sept. | Messages du chauffeur reçus par le client ; règle d'une heure | Fait, web |
| 17 et 18 sept. | Courriels automatiques avec ajout à l'agenda du chauffeur pour chaque course confirmée | Fait ; en attente du compte Brevo et du domaine |
| 19 sept. | Suppression de compte et conformité magasins : suppression dans les deux apps, page web publique de suppression, politique de confidentialité, conditions d'utilisation, dossier Google Play / App Store | **En ligne depuis le 19 septembre au soir** (voir les lignes suivantes). 11 tests + scénario complet sur base locale (24 vérifications). Suite passée de 41 à 52 tests |
| 19 sept. | Revue complète du projet demandée par le propriétaire, à partir de ses textes d'origine : chaque demande vérifiée dans le code, puis contestée par un second passage | **Pas terminée** : le document `docs/ETAT-DU-PROJET.md` annoncé n'a jamais été produit. Les défauts graves ont été traités par la relecture adversariale du 19 septembre (ligne suivante), mais la vérification demande par demande reste à faire |
| 19 sept. | Prendre en compte le domaine `taxisylvain.ca` acheté par le propriétaire | **Fait et vérifié en production.** Adresses `dispatch.`, `chauffeur.`, `client.`, `www.` et racine rattachées aux sites, `api.` au serveur, certificats valides ; CORS et liens des courriels mis à jour dans Railway sans redéployer de code ; futurs APK réglés sur `api.taxisylvain.ca`. Le script de vérification contrôle désormais les 8 adresses web et leur autorisation par le serveur |
| 19 sept. | Firebase : ranger les fichiers et brancher les notifications | **Fichiers rangés et vérifiés** ; trou corrigé : Expo n'emporte pas les fichiers exclus de Git, d'où `app.config.js` qui les lit depuis des variables EAS de type fichier (5 tests). Dépôt de ces variables et de la clé FCM en attente de la connexion au compte Expo |
| 19 sept. | Sauvegarder le code sur GitHub | **Fait et vérifié** : historique vérifié sans aucun secret avant l'envoi, puis 40 enregistrements identiques sur GitHub et sur le PC |
| 19 sept. | Préparer l'appel masqué Twilio | **Corrigé avant la mise en service** : les numéros saisis librement (« 514-555-1234 ») sont convertis au format international exigé par Twilio, un numéro invalide donne un message clair sans révéler le numéro de l'autre partie (5 tests). Pas encore en ligne : partira avec la prochaine mise en ligne du serveur |
| 19 sept. | Publier les pages légales et toutes les mises à jour | **Relecture adversariale d'abord** (4 relecteurs, 5 contre-vérifications) : défauts graves trouvés, dont deux déjà en production (une requête anonyme sur /login arrêtait le serveur ; envoi de photos pouvant écrire un fichier .html hors du dossier). **Corrigé, testé (87 tests + 34 vérifications sur un serveur local réel) et mis en ligne** : filet d'erreurs, contrôle des types, sessions revérifiées en base, photos verrouillées, suivi de course et cédule réservés, suppression de compte sûre, chauffeurs renvoyés vers Taxi Sylvain, GPS relayé seulement au chauffeur affecté. Trois sites republiés sur `api.taxisylvain.ca`. Aller-retour de compte jetable vérifié en production. **Pages légales réécrites puis vérifiées phrase par phrase contre le code** (33 écarts, tous traités) **et publiées** : `/confidentialite`, `/conditions`, `/suppression-compte`, sur `api.taxisylvain.ca`. Au passage : ancien chauffeur retiré du suivi d'une course, compte supprimé déconnecté du temps réel. Restent à la charge du propriétaire : adresse postale et raison sociale (Loi 25), relecture juridique des conditions (clause de modification, art. 11.2 LPC) |
| 19 sept. | Suppression du compte chauffeur : « automatique, pas besoin de vérifier quoi que ce soit » | Fait : le chauffeur supprime son compte dans l’app ou sur `/suppression-compte`, sans vérification de redevance ni de course en cours ; ses courses non terminées repartent chez le Dispatch (alerte), le client qui suit sa course voit « en attente », et les courses retirées sortent de l’agenda du chauffeur (courriel d’annulation dès que Brevo est branché). Pages légales mises à jour. Version web du chauffeur et page web à jour ; les APK installés (13 septembre) n’ont pas encore l’écran de suppression, il arrivera avec la prochaine compilation |
| 20 sept. | Inscription d'un client dans l'application | Fait : un nouveau client ouvrait un compte par téléphone seulement — l'écran de connexion n'offrait aucune porte alors que le serveur savait inscrire. Écran d'inscription, courriel insensible aux majuscules, doublon refusé. Parcours joué dans un navigateur |
| 20 sept. | Cédule du Dispatch triée par heure | Fait : les courses arrivaient dans l'ordre de saisie et les créneaux étaient empilés dessous. Une seule liste triée par heure, et le changement d'heure ne décale plus la grille (12 tests) |
| 20 sept. | Courses des applications par jour et par heure | Fait côté serveur et web : tri « heure de prise en charge sinon heure de création », journée calculée à l'heure du Québec et envoyée aux applications, titre par journée (43 tests). Les téléphones déjà équipés le verront à la prochaine compilation |
| 20 sept. | Recherche de client dans la console | Fait : nom, téléphone, courriel, adresse ; les fiches écartées sont masquées, pas retirées (mémo en cours de saisie préservé) ; la fiche dit par quel champ elle a été trouvée (11 tests) |
| 20 sept. | Trois tarifs YUL/YHU/REM modifiables sur la fiche client | Fait : prix négocié par client, qui l'emporte sur la grille ; affiché en regard du prix de grille à la création d'une course ; exportable et importable ; réservé aux comptes autorisés aux Courses ; un zéro n'est jamais une course gratuite |
| 20 sept. | Adresses trop longues, et Waze qui ouvre au mauvais endroit | Fait : forme unique « numéro + rue, ville, province + code postal » écrite au serveur, donc valable pour les trois interfaces, les courriels et l'agenda sans recompiler. GARDE-FOU : une mise en forme ne peut jamais changer la municipalité reconnue, donc jamais le prix. Waze ne lance plus le guidage sur son premier résultat ; guidage direct seulement sur un point sûr ; abréviations écrites en toutes lettres avant toute recherche ; déclaration iPhone ajoutée |
| 20 sept. | Saisie intuitive d'adresses partout | Fait : suggestions branchées dans la correction d'une course, le domicile d'un nouveau client et les adresses des destinations ; le nom du lieu s'affiche dans la liste sans entrer dans l'adresse ; les anciennes adresses sont proposées nettoyées |
| 20 sept. | Rappels : courriel 80 min, notifications fiables, escalade 60 min | Fait : courriel de rappel 80 minutes avant ; escalade à 60 minutes si le chauffeur n'est pas en ligne ou pas en route (notification spéciale, son d'urgence, courriel d'urgence, appel vocal Twilio inactif sans clé, alerte au Dispatch) ; délai maximal et verrou sur la boucle de rappels ; une course déplacée redéclenche ses rappels (14 tests) |
| 20 sept. (reprise, après-midi) | **Mise en ligne de la reprise** | Serveur : en ligne le 20 septembre au soir (migration appliquée, journaux « Courriels : brevo », « Notifications web (Web Push) : actives »), vérifié par `scripts/verifier-mise-en-ligne.mjs`. Sites web : la CLI Vercel s'était retrouvée déconnectée sur le PC (« No existing credentials found ») ; reconnexion faite par le propriétaire (`vercel login`, approbation dans le navigateur), puis les trois sites republiés le 20 septembre vers 17 h, alias `taxi-sylvain-client.vercel.app` refait, script de vérification des huit adresses au vert, service worker `/sw.js` servi par les trois adresses. Piège à retenir : vérifier `vercel whoami` avant toute publication |
| 20 sept. (reprise, après-midi) | Confirmation du courriel par code à six chiffres pour les nouveaux comptes (inscription dans l'app, chauffeurs et clients créés par le Dispatch, collaborateurs) | Fait, serveur en ligne (sites web : voir la ligne précédente) : code gardé en empreinte, valable 15 minutes, 5 essais, renvoi après 1 minute ; aucun jeton ne part avant le code ; écran de saisie dans les deux applications (web) et dans la console ; le Dispatch peut confirmer à la main (« Courriel non confirmé · Confirmer » sur les fiches) ; les comptes existants sont confirmés d'office par la migration ; sans service de courriel ou sans vrai courriel (réservation par téléphone), personne n'est bloqué ; le Dispatch n'est jamais bloqué (13 tests, scénario local 32 vérifications) |
| 20 sept. (reprise) | Notifications des versions web : rien ne s'affichait sur Android Chrome | Fait et en ligne : service worker (`public/sw.js`) et Web Push (clés VAPID sur Railway) dans les trois sites ; abonnement à la connexion, désabonnement à la déconnexion ; les notifications du serveur arrivent même onglet fermé sur Android et sur ordinateur ; sur iPhone seulement quand l'app est ajoutée à l'écran d'accueil (limite d'Apple). Sans clés, tout continue de marcher sans notification web |
| 20 sept. (reprise) | Défauts relevés par la revue du code : semaine du récap comptée en UTC, tâches planifiées à l'heure du serveur, correction d'une course qui faisait sonner le chauffeur comme une nouvelle affectation, client qui n'entendait un changement que sur l'écran de suivi, abonnement au suivi perdu après une coupure réseau, jetons push périmés jamais effacés, pas de canal Android prioritaire, son iPhone coupé en mode silencieux | Fait : bornes de semaine et tâches à l'heure du Québec (test : une course terminée le dimanche à 22 h compte dans la semaine écoulée) ; `ride:updated` au lieu de `ride:assigned` pour une correction ; évènement personnel `ride:client-update` pour le client ; réabonnement automatique ; jeton `DeviceNotRegistered` effacé ; canal « urgence » ; mode audio réglé. Web en ligne ; son, canal et réabonnement sur les téléphones à la prochaine compilation |
| 20 sept. (reprise) | Accueil des applications trié (à prendre, puis à faire par heure, historique après) ; notation à rattraper proposée à l'ouverture ; sélecteur de date et d'heure natif dans l'app client ; page Courses de la console avec recherche, filtres (statut, période, chauffeur) et pagination par 20 ; récap hebdomadaire envoyé par courriel aux chauffeurs chaque lundi ; script de remise en forme des adresses existantes | Fait (suite de tests passée de 201 à 232). Le web garde les champs de date du navigateur ; le sélecteur natif est dans les APK 1.3.0 |
| 20 sept. 16 h 50 | « Je te donne mon accord pour recompiler les 2 APK » | **Fait** : versions 1.3.0 (versionCode 4) compilées sur EAS pour le chauffeur et le client, fichiers Firebase inclus, APK et liens rangés dans le dossier de passation OneDrive (`01-Applications/Android`), anciennes 1.2.0 archivées. Les cinq changements natifs (écran du code, sélecteur de date, canal « urgence », son en mode silencieux, réabonnement au suivi) sont donc sur les téléphones dès l'installation. Reste au propriétaire : distribuer les liens et tester sur un vrai téléphone |
| 20 sept. 17 h 20 | « Lance la simulation et applique » (remise en forme des adresses existantes) | **Fait** : simulation lue puis appliquée dans le conteneur Railway (voir § 10, point 10) : 10 adresses réécrites, 0 refusée, contre-simulation à zéro |
| 20 sept. 17 h 45 | « Un client et un chauffeur peuvent supprimer leur compte eux-mêmes, mais cela initie une demande de suppression chez le Dispatch, qui doit valider » ; choix du propriétaire : compte actif jusqu'à la décision, réponse sous 30 jours | **Fait** : champs `deletionRequestedAt` et `deletionRequestVia`, routes `/delete-account` et `/delete-account-web` qui enregistrent la demande (compte conservé), `/cancel-deletion`, page Suppressions de la console (valider, refuser avec raison, pastille), écrans des deux apps (demande, état en attente, annulation, rappel en bandeau, décision reçue en direct), courriels d'accusé de réception, d'alerte au Dispatch et de décision, pages légales réécrites (« demande traitée sous 30 jours »). 4 tests de règles, scénario local de 29 vérifications (refus 409 pendant une course, validation, annulation, page web, rôles). Sur les APK 1.3.0, l'écran affiche encore « suppression immédiate » mais le serveur enregistre bien une demande : à corriger à la prochaine compilation |
| 20 sept. 17 h 50 | Adresse postale et raison sociale (« 2060, rue Saint-Georges, Longueuil (Québec) J4K 2C8, Canada », « Taxi Sylvain ») | **Fait** : écrites dans la politique de confidentialité, les conditions et la page de suppression (responsable des renseignements personnels, demandes écrites par la poste) |
| 20 sept. 18 h 10 | Recherche instantanée du client à la création d'une course (console) | **Fait** : champ qui filtre la liste déroulante (nom, téléphone, courriel, adresse, sans accents, règle `clientSearch.js`), Entrée choisit le premier |
| 20 sept. 18 h 30 | « Dans Courses, un onglet recherche en haut et la possibilité de modifier tous les détails et aspects d'une course ; dans la Cédule aussi » | **Fait** : la barre de recherche et filtres de Courses est en haut de la page (depuis 17 h) ; bouton **Modifier** sur chaque course, et clic sur une course de la Cédule (et de la Recherche) : fenêtre complète (client avec recherche, chauffeur, statut, adresses, destination du catalogue avec tarif recalculé, heure, vol, montant, distance, suppression). Serveur : `PATCH /rides/:id` étendu (client, chauffeur, statut, destination du catalogue, distance) avec les mêmes effets que les actions équivalentes (agenda, notifications, temps réel), règles de statut dans `lib/rideEdit.js` (6 tests), scénario local |
| 20 sept. 18 h 40 | « Dans la grille tarifaire, une nouvelle ville se met en bas ; la ranger par ordre alphabétique » | **Fait** : `GET /pricing/zones` renvoie la grille triée par nom, accents et majuscules ignorés (`trierZonesParNom`, 1 test) |
| 23 sept. | Twilio : « j'ai obtenu ce qu'il fallait » (compte payant, numéro, service Proxy) | **Fait et en ligne** : SID du service Proxy lu par l'API, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PROXY_SERVICE_SID` et `TWILIO_CALLER_NUMBER` (`+1 450 912-4572`) déposés sur Railway, serveur redéployé (journal « Appel vocal de rappel : actif »), session Proxy d'essai créée puis supprimée avec le code du serveur. Reste : un vrai appel depuis un téléphone |
| 23 sept. | Appels masqués dans les deux sens | **Fait** : l'app Client n'avait que le message au chauffeur ; bouton « Appeler le chauffeur (votre numéro sera masqué) » ajouté au suivi de course (`TrackingScreen.js`), visible seulement pour une course `ACCEPTED`, `EN_ROUTE` ou `STARTED`. Version web republiée (client.taxisylvain.ca, alias refait, vérification au vert) ; sur les téléphones à la prochaine installation |
| 23 sept. | « Liens de téléchargement définitifs » | **Fait** : route `/telecharger/chauffeur.apk` et `/telecharger/client.apk` (dernier fichier par version, 2 tests). **Incident** : le premier déploiement a fait tomber l'API pendant environ six minutes (import `path` en double dans `index.js`, erreur de syntaxe au démarrage que les tests ne chargent pas ; `railway status` = Crashed, 502) ; corrigé et redéployé, santé 200. Leçon : lancer `node --check src/index.js` avant tout `railway up` |
| 23 sept. | « Quand je choisis une cliente dans Nouvelle course, elle ne s'inscrit pas dans le champ et la liste reste ouverte » | **Fait et publié** (console Dispatch) : à la sélection (clic ou Entrée), le nom du client remplit le champ de recherche et la liste se referme ; elle se redéploie dès qu'on retape (`Courses.jsx`, états `listeClientsOuverte`, `choisirClient`) |
| 23 sept. | « Mettre à jour le Bilan de projet et le Récapitulatif complet ; coûts (Claude, LWS 19 $, Railway 0 $) ; liens définitifs » | **Fait** : `06-Rapports/Recapitulatif-complet-projet-23-septembre.html/.pdf` et `Bilan-de-projet-23-septembre.html/.pdf` (OneDrive, copies Jarvis), liens définitifs dedans ; montants Claude à reporter dès que Christopher fournit les factures. Courriel contact@ : réception dans Gmail prouvée par un envoi d'essai Brevo le 23 |
| 23 sept. | « go SDK 54 » | **Fait** : les deux apps passées d'Expo SDK 51 à 54 (React Native 0.81, React 19.1, nouvelle architecture, bord à bord Android, `react-native-safe-area-context`, gestionnaire de notifications SDK 53+, canaux Android créés avant la permission ; `expo-av` conservé mais déprécié, à remplacer par `expo-audio` avant SDK 55). Vérifié : `expo-doctor` 18/18 sur les deux apps, exports web rendus sans erreur dans Edge. Version 1.4.0 (build 6, versionCode 6). Compilations EAS : iOS chauffeur `c6742ddd`, iOS client `cf31d70e` (Xcode 26.0, SDK iOS 26.0 vérifiés dans le fichier), Android chauffeur `2a4b9b26`, Android client `330d5bfa`. iOS : envois acceptés par Apple, groupe externe et lien public (voir Apple ci-dessus). Android : APK 1.4.0 dans OneDrive et sur `api.taxisylvain.ca/uploads/apk/`, 1.3.1 retirés. Web : trois sites republiés, vérification au vert |
| 23 sept. | « Fiches créées » (App Store Connect) puis envoi TestFlight | **Échec** : trois soumissions EAS Submit en erreur sans journal ; journal Xcode lu : SDK iOS 17.5. Apple exige Xcode 26 / SDK iOS 26 depuis le 28 avril 2026 ; Expo SDK 51 ne peut pas suivre. Décision attendue de Christopher : mise à niveau vers Expo SDK 54 (une à deux journées, re-test complet) |
| 23 sept. | « Vérifier que tout est développé conformément aux documents de référence » | **Audit de conformité** livré (`livrables/cabinet/taxisylvain-revision-applications/2026-09-23_audit-conformite.md` du Jarvis, copie OneDrive `06-Rapports/Audit-conformite-23-septembre.md`) : 244 tests verts, 14 contrôles de mise en ligne verts, 96 exigences passées en revue, 89 faites (21 à tester sur téléphone), 3 partielles, 1 non faite (exploitation), 3 décisions ouvertes |
| 23 sept. | « Accord explicite pour tout mettre à jour, Android et iOS » | **APK 1.3.1 (versionCode 5) compilés** (chauffeur `db648c54`, client `04303443`), rangés dans OneDrive `01-Applications/Android` (1.3.0 archivées), déposés sur le volume Railway par `railway ssh` (script `dl-apk.js`, téléchargement depuis Expo dans le conteneur), anciens 1.3.0 retirés du volume, `Liens-de-telechargement.txt` réécrit. Sur les téléphones : appels masqués dans les deux sens, texte de suppression corrigé |
| 23 sept. | Libellés des boutons : « Appeler (votre numéro sera masqué) » et « Appeler le chauffeur (votre numéro sera masqué) » | **Fait** : versions web chauffeur et client republiées ; compilations iPhone relancées avec ces libellés (chauffeur `2255af9f`, client `952f7e2a`, remplacent `1d774682` et `0c394576`) |
| 23 sept. | « Apple : obtenir les versions téléchargeables » | **Compilations iPhone 1.3.1 faites** (chauffeur puis client ; pour le client, eas-cli refusait de créer les identifiants sans terminal : piloté depuis Node avec réponses automatiques, certificat réutilisé, profil créé). Versions passées à 1.3.1 (build 5) dans les deux `app.json`. Bloqué par deux actions du titulaire du compte Apple : clé APNs et fiches App Store Connect (voir § 10) |
| 20 sept. 17 h 55 | « Faire en sorte que le récapitulatif soit envoyé par courriel chaque semaine aussi » | Déjà fait l'après-midi pour chaque chauffeur (lundi 00 h 05, heure du Québec) ; ajouté : une synthèse de tous les chauffeurs envoyée au compte Dispatch, même une semaine sans course (1 test) |
| 21 sept. | « Taxi Sylvain est basé à Longueuil, pas Chambly. Corrige dans tous les documents et sur le site » | **Fait et vérifié en ligne le 21 septembre** (serveur redéployé, 244 tests verts, script de vérification vert) : pages légales (`conditions.html`, `confidentialite.html`), `PASSATION.md`, `PASSATION-COMPLETE.md`, `CONFORMITE-MAGASINS.md` (texte et mots-clés des magasins). Chambly reste une municipalité desservie et une adresse d'exemple dans les tests |
| 21 sept. | « Indique à ces 4 emplacements : Yves Christopher, Directeur Technique, Taxi Sylvain » (site, application de réservation, conditions, confidentialité) | **Fait et vérifié en ligne** (serveur et app Client redéployés, alias de l'ancienne adresse refait). Mention ajoutée au pied de page et à la page Contact du site WordPress, sous l'aide de l'écran de connexion de l'app Client (`LoginScreen.js`, version web seulement, les APK la prendront à la prochaine compilation), et dans la section « Nous joindre » de `conditions.html` et `confidentialite.html` (date de mise à jour portée au 21 septembre). La personne responsable au sens de la Loi 25 reste « le propriétaire » : non modifiée, à confirmer |
| 21 sept. | « Comment obtenir une adresse contact@taxisylvain.ca ? », choix de la redirection gratuite | **Fait et vérifié** : `contact@taxisylvain.ca` existe. Réception : redirection ImprovMX (compte du propriétaire, offre gratuite) vers son Gmail ; envoi : Gmail « Envoyer en tant que » par le SMTP de Brevo. DNS chez Vercel : MX `mx1` et `mx2.improvmx.com`, TXT `v=spf1 include:spf.improvmx.com include:spf.brevo.com ~all` ; DKIM et DMARC de Brevo inchangés. LWS ne permet pas de boîte sur un domaine ajouté en multi-domaine. Adresse publiée sur le site WordPress et dans `conditions.html` et `confidentialite.html` (section courriel réécrite, fournisseurs ImprovMX et Google nommés, mention « Brevo pas encore activé » corrigée). Décision du propriétaire le même soir : les demandes d'accès et de correction (Loi 25) sont acceptées **par courriel ou par la poste**, écrit dans `confidentialite.html`, `conditions.html` et `suppression-compte.html`. Conséquence : surveiller cette boîte, la loi donne 30 jours pour répondre |
| 21 sept. | Site vitrine WordPress sur `taxisylvain.ca` et `www` | **Fait et vérifié en ligne** : WordPress 7.1.1 installé à la main chez LWS (base partagée avec nskgroup.org, préfixe `ts_`), sept pages publiées, non indexé jusqu'à validation du propriétaire. Outil de publication et compte rendu dans le Jarvis : `livrables/sites-web/taxisylvain-site-wordpress/`. Ne dépend pas de ce dépôt |

---

## 12. Comptes et accès

| Service | Rôle | Identifiant |
|---|---|---|
| Railway | API, base Postgres, photos | projet `taxi-sylvain`, service `backend` |
| Vercel | trois sites web | équipe `taxi-sylvain` ; projets `taxi-sylvain-dispatch`, `taxi-sylvain-driver`, `client-app` |
| Expo / EAS | compilation des APK | équipe `taxisylvains-team` |
| OpenStreetMap, OSRM | adresses, cartes, distances | sans compte |

Un jeton d'accès Expo nommé « Claudeagent (robot) » a été créé pour les compilations. Si le propriétaire
change de prestataire ou d'assistant, il peut le révoquer depuis expo.dev et en créer un nouveau.
