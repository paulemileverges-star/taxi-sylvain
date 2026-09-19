# Passation du projet Taxi Sylvain

Document de reprise pour tout assistant ou développeur qui continue le projet. Il décrit l'état réel au
**18 septembre 2026** (commit `9886d2b` et suivants), la façon de travailler avec le propriétaire, les
procédures de déploiement, les règles métier à ne pas casser et tout ce qui reste à faire.

Lire aussi : `AGENTS.md` (règles courtes), `docs/ARCHITECTURE.md` (choix techniques d'origine),
`backend/.env.example` (variables d'environnement commentées).

---

## 1. Le propriétaire et la façon de travailler avec lui

- **Qui** : propriétaire de Taxi Sylvain (taxi et transferts aéroport, Rive-Sud de Montréal, Chambly) et de
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

APK Android : produits par EAS Build, profil `preview`. Les derniers APK datent du 13 septembre (commit
`e327a49`) : tout ce qui a été livré après n'existe que sur les versions web tant qu'on ne recompile pas.

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
apps/driver-app/      app chauffeur, React Native / Expo SDK 51 (APK + version web react-native-web)
apps/client-app/      app client, React Native / Expo SDK 51 (APK + version web react-native-web)
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

- **Toujours lancer depuis `backend/`.** Depuis la racine, la CLI est liée à un service parasite nommé
  `taxi-sylvain`, en échec (§ 8).
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
| Railway, service backend | `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `PORT` ; optionnelles : `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PROXY_SERVICE_SID`, `BREVO_API_KEY` ou `RESEND_API_KEY`, `MAIL_FROM`, `DRIVER_APP_URL`, `CLIENT_APP_URL` |
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
- **Téléphones** : jamais transmis à l'autre partie. Messagerie interne ; appel masqué via Twilio Proxy
  quand le compte sera configuré.
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

---

## 10. Travaux restants

### Bloqués par le propriétaire (comptes à créer)

| Élément | Ce qu'il doit faire | Ce qui se fait ensuite |
|---|---|---|
| GitHub | **fait le 19 septembre** : dépôt privé `paulemileverges-star/taxi-sylvain`, branche `master` suivie par `origin` | envoyer chaque enregistrement avec `git push` ; l'écrasement forcé est interdit dans `.claude/settings.local.json` |
| Nom de domaine | **fait le 19 septembre : `taxisylvain.ca`**, rattaché aux trois sites et à l'API | DNS pour Brevo et courriel pro exigé par Apple, dès l'ouverture de ces comptes |
| Numéro D-U-N-S | **demande envoyée le 19 septembre**, confirmation attendue de Dun & Bradstreet | comptes d'entreprise Google Play et Apple |
| Brevo | créer le compte, vérifier le domaine, mettre `BREVO_API_KEY` et `MAIL_FROM` dans Railway | tester avec le bouton de la page Administrateurs |
| Firebase | **projet `taxi-sylvain` créé le 19 septembre, fichiers rangés** : `google-services.json` et `GoogleService-Info.plist` dans chaque app (exclus de Git), clé de compte de service dans `C:UsersPCcles-taxi-sylvain` | reste : déposer les fichiers dans les variables EAS (`GOOGLE_SERVICES_JSON`, `GOOGLE_SERVICE_INFO_PLIST`, relayées par `app.config.js`) une fois `eas login` fait, et la clé FCM V1 sur expo.dev pour chaque projet, puis recompiler avec accord |
| Expo Starter ou 1er octobre | activer le forfait sur l'équipe `taxisylvains-team` | recompiler les deux APK |
| Apple Developer | inscription, idéalement comme entreprise avec numéro D-U-N-S | builds iOS, TestFlight |
| Google Play | compte d'entreprise, 25 USD | fiches des applications |
| Twilio | compte, numéro, service Proxy | appel masqué |
| Prix REM | saisir les montants dans la page Tarifs | aucun code à écrire |
| Plattsburgh | dire comment tarifer ce cas qui dépend du départ | modéliser |

### À développer

1. **Suppression de compte dans les apps** et page web équivalente : **écrite et vérifiée le 19 septembre, pas encore en ligne.** `POST /api/auth/delete-account` (connecté) et `POST /api/auth/delete-account-web` (public, exigé par Google Play), règles dans `lib/accountDeletion.js`, 11 tests dans `test/accountDeletion.test.js`, écran « Supprimer mon compte » dans les deux apps, page publique `/suppression-compte`. Reste à faire : déployer, puis vérifier les adresses publiques en production.
2. **Politique de confidentialité et conditions d'utilisation** : **écrites, pas encore en ligne.** Pages publiques `/confidentialite` et `/conditions` (+ alias `/privacy` et `/terms`), servies par `routes/public.js` depuis `src/public/`. Rédigées à partir du code réel (position jamais stockée, téléphone jamais transmis, fournisseurs listés, Loi 25 et LPRPDE). Aucune adresse courriel de contact : le propriétaire n'a pas encore de domaine. **À faire relire par un conseiller juridique.**
3. **Préparation des magasins** : voir `docs/CONFORMITE-MAGASINS.md`, qui contient les réponses prêtes au formulaire « Sécurité des données », la justification de localisation en arrière-plan, le scénario de la vidéo Google, la marche à suivre pour le compte de démonstration Apple et les textes de fiche. **Manque encore dans le code** : un profil de compilation « production » produisant un `.aab` — `eas.json` ne sait produire qu'un APK d'essai, que Google Play refuse.
4. **Tests de bout en bout** : créer une course, l'affecter, la suivre sur la carte, écrire un message, noter.
5. **Environnement de test séparé** : deuxième service et deuxième base sur Railway, données fictives.
6. **Alerte d'erreurs** : Sentry en version gratuite sur l'API et les trois interfaces.
7. **Sauvegardes de la base** : vérifier et activer les sauvegardes Postgres sur Railway.
8. **Registre des demandes** : tenir à jour la section 11 à chaque nouvelle vague.

---

## 11. Historique des demandes et état

État au 18 septembre 2026. « Web » signifie livré sur les versions web mais absent des APK du 13 septembre.

### Cahier des charges initial (8 septembre)

| N° | Demande | État |
|---|---|---|
| — | Trois applications : Dispatch, Chauffeur, Client | Fait |
| 1 | Navigation Waze ou Google Maps au choix | Fait |
| 2 | Messagerie sans échange de contacts, appels masqués si possible | Messagerie faite ; appel en attente de Twilio |
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
| — | Installation hors magasins Android et iPhone | Android fait ; iPhone en attente du compte Apple |
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
| 19 sept. | Suppression de compte et conformité magasins : suppression dans les deux apps, page web publique de suppression, politique de confidentialité, conditions d'utilisation, dossier Google Play / App Store | **Écrit et vérifié, pas encore en ligne.** 11 tests + scénario complet sur base locale (24 vérifications). Suite passée de 41 à 52 tests |
| 19 sept. | Revue complète du projet demandée par le propriétaire, à partir de ses textes d'origine : chaque demande vérifiée dans le code, puis contestée par un second passage | En cours — voir `docs/ETAT-DU-PROJET.md` |
| 19 sept. | Prendre en compte le domaine `taxisylvain.ca` acheté par le propriétaire | **Fait et vérifié en production.** Adresses `dispatch.`, `chauffeur.`, `client.`, `www.` et racine rattachées aux sites, `api.` au serveur, certificats valides ; CORS et liens des courriels mis à jour dans Railway sans redéployer de code ; futurs APK réglés sur `api.taxisylvain.ca`. Le script de vérification contrôle désormais les 8 adresses web et leur autorisation par le serveur |
| 19 sept. | Firebase : ranger les fichiers et brancher les notifications | **Fichiers rangés et vérifiés** ; trou corrigé : Expo n'emporte pas les fichiers exclus de Git, d'où `app.config.js` qui les lit depuis des variables EAS de type fichier (5 tests). Dépôt de ces variables et de la clé FCM en attente de la connexion au compte Expo |
| 19 sept. | Sauvegarder le code sur GitHub | **Fait et vérifié** : historique vérifié sans aucun secret avant l'envoi, puis 40 enregistrements identiques sur GitHub et sur le PC |

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
