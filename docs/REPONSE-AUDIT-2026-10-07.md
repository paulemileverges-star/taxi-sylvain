# Réponse à l'audit du 7 octobre 2026

Réponse, constat par constat, au rapport « Audit Taxi Sylvain » du 7 octobre 2026 (59 pages, 67 constats : 12 P1,
51 P2, 4 P3), qui concluait : « Je déconseille donc de valider la livraison en l'état ». Chaque correction est
reliée à son emplacement dans le code et à sa preuve. Les écarts avec les recommandations sont dits tels quels, au
§ 6. Document tenu dans le dépôt (`docs/REPONSE-AUDIT-2026-10-07.md`) ; procédures et règles dans `docs/PASSATION.md`.

---

## 1. En bref

- **Les 12 constats prioritaires (P1) sont corrigés dans le code et en production** depuis le 7 octobre 2026 à
  12 h 52 (heure du Québec). Trois réserves : F01, F02 et F03 ne toucheront les téléphones qu'avec une version 1.5.1
  des applications (elle attend l'accord du propriétaire) ; la copie chiffrée des sauvegardes hors de Railway
  (SEC-15) est prête mais s'active par deux variables à poser par le propriétaire.
- **Bilan des 67 constats** :

  | Statut | Nombre | Constats |
  |---|---|---|
  | Corrigé, vérifié, en production | 40 | SEC-01 à 06, 08, 09, 10, 13, 14, 16, 17, 18 ; CONC-01, 02 ; B04, 06, 07, 08, 10, 11, 13, 14, 15, 16, 17, 21 ; F04, 05, 11, 15, 16, 18, 22, 23 ; OPS-01, 02, 04 ; WEB-02 |
  | Corrigé, en ligne sur les versions web ; téléphones avec la 1.5.1 | 12 | F01, 02, 03, 06, 07, 08, 09, 10, 12, 17, 19, 21 |
  | Corrigé avec une réserve (§ 6) | 8 | SEC-07, 11, 12, 15, 19 ; B05 ; F14 ; OPS-05 |
  | Corrigé en partie (§ 6) | 3 | F20, F24, B19 |
  | Décision ou accord du propriétaire | 4 | B18, WEB-01, GOV-01, OPS-03 |

- **Limite qui demeure, comme pour l'audit** : aucun essai sur un vrai téléphone Android ou iPhone, et pas de
  parcours visuel complet des écrans. Les versions natives distribuées (1.4.0 par les liens, 1.5.0 compilée)
  n'embarquent pas les corrections des applications.

## 2. Ce qui est en production

| Élément | État vérifié le 7 octobre 2026 |
|---|---|
| Serveur (Railway, service `backend`) | version `2026-10-07.audit`, migration `20261007120000_audit_7_octobre` appliquée au démarrage, redémarré à 12 h 52 (heure du Québec) ; journaux : courriels Brevo, rappel vocal, Web Push et alertes actifs ; copie externe inactive (variables absentes) |
| `GET /health/ready` | `"base":"ok"`, version et migration ci-dessus, dernière sauvegarde de 9,4 h, aucun canal d'envoi en panne |
| Console Dispatch, App Chauffeur web, App Client web (Vercel) | publiées par `scripts/publier-web.mjs`, toutes au commit `d5db9b6083e4` (marque lue dans les fichiers servis), appelant `api.taxisylvain.ca`, chargées dans Edge sans écran blanc |
| Site vitrine WordPress | pages Nos services, Chauffeurs, Réserver et FAQ corrigées (WEB-02), contrôleur du site vert sur les 7 pages |
| Applications installées | inchangées : liens définitifs sur la 1.4.0, 1.5.0 compilée avant l'audit ; compatibles avec le serveur corrigé (§ 6) |

Commits : `cb9925d` (serveur, tests, contre-expertise), `6349283` (console), `fe43f96` (applications), `4576b34`
(dépendances), `d5db9b6` (surveillance), `0b60911` (intégration continue), `9741dc3` (adresse du serveur
contrôlée) et le commit de cette réponse.

## 3. Comment c'est prouvé

- **343 tests unitaires** (`cd backend && npm test`), verts, aussi à l'heure UTC des machines de GitHub. Les règles
  de l'audit sont dans `test/audit-2026-10-07.test.js` (26 tests), `fuseauOrdinateur.test.js`,
  `connexionTempsReel.test.js`, `livraisons.test.js`, `rappels.test.js` (B18), `webPush.test.js`,
  `sessions.test.js`, `deleteUser.test.js`.
- **Deux scénarios de bout en bout** sur une base PostgreSQL 17 jetable, avec un vrai serveur, de vraies connexions
  temps réel, aucun fournisseur et le réseau extérieur bloqué : `test-e2e/audit-2026-10-07.mjs` (24 vérifications,
  un défaut de l'audit par vérification) et `test-e2e/scenario-2026-10-06.mjs` (10). Joués sur le poste, à l'heure
  UTC, et en mode intégration continue (base fournie par `E2E_DATABASE_URL`, créée par Prisma).
- **Sondes de l'audit rejouées** contre le serveur corrigé, sur base jetable : les 10 sondes de sécurité réelles
  (SEC-01, 02, 03, 05, 06, 07, 17, CONC-01, CONC-02, CTRL-01) ne trouvent plus aucune vulnérabilité. Deux ont été
  adaptées, sans changer ce qu'elles mesurent : la sonde SEC-02 plantait sur la réponse 403 désormais renvoyée, et la
  sonde CONC-02 utilisait un jeton que SEC-07 révoque. Les sondes métier MET-01 à MET-11 s'exécutent (MET-03 :
  « CONFORME_LOCAL », la course libérée revient à `REQUESTED`). La sonde MET-12 s'arrête : elle fabrique une
  sauvegarde sans transaction, au moyen d'un faux adaptateur qui efface des lignes entre deux lectures, puis attend
  que le validateur l'accepte. Le validateur la refuse désormais (« Sauvegarde incohérente : 1 référence orpheline »),
  ce qui est la correction voulue. Avec la vraie connexion, la lecture se fait dans une transaction en lecture seule
  `REPEATABLE READ` (vérification SEC-15 du scénario).
- **Intégration continue** (`.github/workflows/ci.yml`) : tests, scénarios et constructions web à chaque envoi.
  Preuve du critère de l'audit : une faille d'accès introduite volontairement (un collaborateur sans droit voyait
  tout) fait échouer le scénario (« ADMIN sans droit : /rides »), code de sortie 1 ; fichier restauré ensuite.
- **Vérification de mise en ligne** (`scripts/verifier-mise-en-ligne.mjs`) : avant le déploiement, elle échouait sur
  l'ancienne production (route `/health/ready` absente, sites sans marque de version) ; après, tout est vert.

## 4. Sécurité, concurrence et sauvegardes

| Constat | P | Statut | Correction | Preuve |
|---|---|---|---|---|
| SEC-01 Notes internes visibles du client et d'un chauffeur non affecté | P1 | Corrigé | Deux fils séparés dans `Message` : fil de course (client et chauffeur affecté, `driverId` vide) et fil direct Dispatch–chauffeur ; les lectures de course et de messages ne servent au client et au chauffeur que le fil de course (`FIL_DE_COURSE`, `routes/messages.js`, `routes/rides.js`) | test unitaire ; scénario SEC-01 ; sonde de l'audit |
| SEC-02 Permissions des administrateurs, lectures et temps réel | P1 | Corrigé | `lib/equipe.js` : `aPermission`, `requireAnyPermission`, salles `equipe:<permission>`, `emettreEquipe` et `AUDIENCES` ; salle `dispatch` réservée au propriétaire ; salles retirées dès qu'une permission l'est (`actualiserSallesEquipe`) ; recherche, chauffeurs, clients, suggestions filtrés par permission | scénario SEC-02 (routes et temps réel, retrait en cours de connexion) ; faille volontaire détectée ; sonde |
| SEC-03 Groupes privés diffusés hors membres | P1 | Corrigé | Salle personnelle `user:<id>` pour chaque compte (`lib/rooms.js`) ; un groupe n'est émis qu'à ses membres (`routes/conversations.js`) | scénario SEC-03 ; sonde |
| SEC-04 Limite de connexion contournée par des espaces | P1 | Corrigé | La clé du limiteur reprend la normalisation de la recherche du compte (`cleTentatives`, espaces et majuscules) | test ; scénario (20 essais) |
| SEC-05 Client qui s'affecte un chauffeur ou diffuse sa course | P1 | Corrigé | Liste fermée des champs qu'un client envoie (`champsReservationClient`, `lib/validationCourse.js`) : ni chauffeur, ni diffusion, ni statut, ni montant | test ; scénario SEC-05/06 ; sonde |
| SEC-06 Code de destination inconnu et tarif imposé | P1 | Corrigé | Code inconnu refusé (400) ; montant envoyé par le client ignoré : tarif du catalogue ou « à confirmer » | test ; scénario ; sonde |
| SEC-07 Mot de passe changé sans révocation | P2 | Corrigé, réserve | `User.sessionVersion` et revendication `sv` du jeton ; changer de mot de passe ou recevoir un mot de passe temporaire passe à la génération suivante : anciens jetons refusés par l'API et le temps réel, jeton neuf rendu à l'appareil qui change | scénario SEC-07 ; `sessions.test.js` ; sonde |
| SEC-08 Destinations Web Push arbitraires | P2 | Corrigé | Seuls les services de notification connus (`SERVICES_PUSH`, `destinationPushAutorisee`), contrôlés à l'abonnement et à l'envoi | `webPush.test.js` |
| SEC-09 Abonnement supprimable par un autre compte | P2 | Corrigé | `retirerAbonnement(endpoint, userId)` ne touche que l'abonnement du compte appelant | scénario SEC-09 |
| SEC-10 HTML injecté par le nom dans un courriel | P2 | Corrigé | `lib/html.js` (`echapperHtml`) pour tout texte venu d'une personne, dans tous les courriels | test |
| SEC-11 Domaine technique à l'inscription publique | P2 | Corrigé, réserve | `erreurCourrielInscription` refuse le domaine technique, quelle que soit la casse | test ; scénario SEC-11 |
| SEC-12 Mots de passe temporaires par `Math.random` | P2 | Corrigé, réserve | `crypto.randomInt` sur un alphabet sans caractères ambigus (`generateTempPassword`) | test |
| SEC-13 Photos acceptées sur le type déclaré | P2 | Corrigé | `lib/images.js` : signature réelle (JPEG, PNG, WebP), dimensions et taille ; fichier refusé effacé | test ; scénario SEC-13 |
| SEC-14 Pas de quota par compte | P2 | Corrigé | `quotaParCompte` : adresses 60 par minute, réservations client 20 par heure, abonnements aux notifications 20 par heure, messages 30 par minute et 4 000 caractères ; GPS : une position par seconde par connexion, coordonnées valides seulement ; réponse 429 sans gêner les autres comptes | test ; scénario SEC-14 |
| SEC-15 Sauvegardes incohérentes, sans copie hors volume | P1 | Corrigé, réserve | Lecture dans une transaction en lecture seule `REPEATABLE READ` ; liens entre tables enregistrés et vérifiés (`verifierRelations`), fichier incohérent refusé ; copie hebdomadaire chiffrée AES-256-GCM hors de Railway, par courriel (`envoyerCopieExterne`, `scripts/dechiffrer-sauvegarde.mjs`) ; âge de la dernière sauvegarde surveillé (`/health/ready`, alerte au-delà de 30 h) | scénario SEC-15 (suppressions simultanées pendant la sauvegarde) ; test |
| SEC-16 Session d'appel masqué non synchronisée | P2 | Corrigé | Session fermée à la réaffectation, à la libération, à l'annulation, à la suppression et à la fin de course (`fermerSessionAppel`), sans jamais bloquer l'action | test avec un faux client Twilio (aucun appel réel) |
| SEC-17 Permission Clients et tarifs à la création | P2 | Corrigé | Prix négociés fixés seulement avec la permission Courses, à la création comme à la modification (`routes/clients.js`) | scénario SEC-17 ; sonde |
| SEC-18 Script de démonstration sans garde | P2 | Corrigé | `prisma/seed.js` refuse toute base non locale et l'environnement de production (`lib/baseLocale.js`) | test |
| SEC-19 Jeton de session complet dans l'adresse des exports | P2 | Corrigé, réserve | Jeton d'export de 5 minutes (`POST /export-link`), limité à l'export, refusé partout ailleurs, invalidé par un changement de mot de passe ; `Cache-Control: no-store`, `Referrer-Policy: no-referrer` | scénario SEC-19 ; `sessions.test.js` |
| CONC-01 Double acceptation simultanée | P1 | Corrigé | Une seule écriture conditionnelle (`updateMany` sur `status: BROADCAST, driverId: null`) ; le perdant reçoit 409 | scénario : 10 offres disputées, un seul gagnant chaque fois ; sonde |
| CONC-02 Note dupliquée par envois simultanés | P2 | Corrigé | Index unique `Rating(rideId, fromUserId)`, doublons existants retirés par la migration (la plus ancienne gardée), conflit rendu en 409, moyenne recalculée par la base (`lib/moyennes.js`) | scénario (envois simultanés) ; sonde |

## 5. Règles métier, interfaces et exploitation

| Constat | P | Statut | Correction | Preuve |
|---|---|---|---|---|
| B04 Abandon chauffeur classé « annulée » | P2 | Corrigé | « Libérer la course » : `REQUESTED`, chauffeur ajouté à `refusedBy`, session d'appel fermée ; l'ancienne demande d'annulation des applications installées est traitée comme une libération | scénario B04 ; sonde MET-03 |
| B05 Accès des comptes importés perdus | P2 | Corrigé, réserve | Mots de passe temporaires des comptes importés montrés une seule fois au Dispatch ; bouton « Nouveau mot de passe temporaire » sur les fiches (sessions fermées) | scénario SEC-17/B05 |
| B06 PDF des listes hors page | P2 | Corrigé | Tableau PDF commun (`tableauPdf`, `largeursAjustees`) : colonnes ajustées à la largeur, hauteur de ligne sur la cellule la plus haute, aucune ligne coupée entre deux pages | PDF générés relus visuellement ; tests d'export verts |
| B07 Rue qui donne le tarif d'une autre ville | P2 | Corrigé | Seule la fin de l'adresse désigne la municipalité, jamais le numéro et la rue (`lib/pricing.js`) | test |
| B08 Ville de Québec non reconnue | P2 | Corrigé | « Québec » reconnu dans la forme « 12 Rue X, Québec, QC G1R 1A1 », région conservée à la mise en forme | test |
| B10 Courses immédiates absentes de la cédule | P2 | Corrigé | Rangées au jour de leur création, au calendrier du Québec | test |
| B11 Import CSV incomplet | P2 | Corrigé | Guillemets lus avant le découpage en lignes, séparateur « ; » d'Excel en français reconnu (`lib/bulkImport.js`) | test |
| B13 Création moins contrôlée que la modification | P2 | Corrigé | Mêmes contrôles (montant et distance positifs ou nuls, date lisible, rôles) ; cédule : date illisible et compte non chauffeur refusés | test ; scénario B13 |
| B14 Rediffusion sans prévenir l'ancien chauffeur | P2 | Corrigé | `retirerChauffeur` : prévenu, retiré de l'agenda et du suivi | scénario B14/B15 |
| B15 Suppression sans évènement ni nettoyage | P2 | Corrigé | `ride:deleted` à tous les écrans (et `ride:updated` annulée pour les applications installées), position effacée | scénario |
| B16 Envoi marqué fait avant réussite | P2 | Corrigé | Résultats `{ tentatives, envoyes, echec }` ; marque retirée en cas d'échec ; récap retenté chaque heure lundi et mardi et au démarrage | scénario B16 (pannes simulées) |
| B17 Notes fictives 5/5 | P2 | Corrigé | Plus de valeur par défaut, moyennes recalculées depuis les notes réelles par la migration et après une suppression de compte ; « Aucune note » affiché | scénario ; `deleteUser.test.js` |
| B18 Règle d'escalade J7 | P3 | Décision du propriétaire | Règle en vigueur écrite (PASSATION § 9) et testée dans ses quatre combinaisons : escalade si hors ligne ou pas encore en route ; pas d'escalade si déjà en route, même hors ligne (fausses alertes pendant la navigation) | `rappels.test.js` |
| B19 Dossier de passation incomplet | P3 | En partie | Contradictions relevées corrigées dans la PASSATION (racine du domaine = site WordPress, récap à 04 h 00, état de Firebase), document daté ; catalogue complet fonction par fonction encore à écrire | `docs/PASSATION.md` |
| B21 « Compte supprimé » annoncé malgré un refus | P2 | Corrigé | Annonce seulement après l'effacement réussi (`routes/admins.js`) | scénario B21 |
| F01 Connexions temps réel multiples | P1 | Web ; 1.5.1 | Module unique `connexionTempsReel.js` dans chaque application : une connexion, fermée entièrement à la déconnexion | `connexionTempsReel.test.js` (6 tests) |
| F02 Notifications perdues après une conversation | P1 | Web ; 1.5.1 | Écouteurs nommés et retirés un par un dans les trois interfaces (plus de retrait global d'un évènement) | relecture du code ; pas de test d'écran |
| F03 Heure de réservation selon le fuseau de l'appareil | P1 | Web ; 1.5.1 | Saisie lue à l'heure de Montréal quel que soit le fuseau (`heureMontrealVersIso`), date sans heure refusée | `fuseauOrdinateur.test.js` (tests sous d'autres fuseaux) |
| F04 Pages inutilisables pour un collaborateur | P1 | Corrigé | Pages selon les permissions (`accesPage`), listes de choix accessibles aux permissions qui en ont besoin (`/drivers/choix`) | test |
| F05 Double validation, deux courses | P2 | Corrigé | En-tête `Idempotency-Key` honoré par le serveur (`lib/idempotence.js`), bouton verrouillé pendant l'envoi | test ; scénario F05 |
| F06 Écran de notation qui enferme | P2 | Web ; 1.5.1 | « Plus tard » et « Passer » toujours présents, panne affichée avec « Réessayer », saisie gardée après un échec | relecture du code |
| F07 Panne affichée comme 0 $ | P2 | Web ; 1.5.1 | Panne affichée comme telle, dernier montant reçu gardé avec son heure ; console : état des courriels « indisponible » distingué d'« aucune clé » | relecture du code |
| F08 Erreurs non gérées, écrans vides | P2 | Web ; 1.5.1 | Session expirée ou révoquée : retour à la connexion ; pannes et envois ratés affichés | relecture du code |
| F09 Ancienne position affichée comme actuelle | P2 | Web ; 1.5.1 | Position remise à zéro au changement de course, effacée en fin de course, signalée si ancienne | relecture du code |
| F10 Suivi client non défilable | P2 | Web ; 1.5.1 | Écran défilable, boutons accessibles sur un petit téléphone | relecture du code |
| F11 Cédule au calendrier de l'ordinateur | P2 | Corrigé | Jours et semaines au calendrier du Québec (`lib/scheduleOrder.js`) | `fuseauOrdinateur.test.js` |
| F12 Réglages de notifications concurrents | P2 | Web ; 1.5.1 | File d'enregistrement : un envoi à la fois, toujours le dernier choix | relecture du code |
| F14 Session locale et navigation | P2 | Corrigé, réserve | Jeton dans le coffre du téléphone (`expo-secure-store`, migration de l'ancien stockage), profil abîmé lu sans écran blanc, bouton retour d'Android (sur les téléphones avec la 1.5.1) | relecture du code |
| F15 Anciennes suggestions d'adresses | P2 | Corrigé | Recherches numérotées, seule la dernière s'affiche, détail tardif ignoré | relecture du code |
| F16 Prix périmé à la création | P2 | Corrigé | Ancien tarif automatique effacé au changement de départ, de destination ou de client ; montant tapé à la main jamais remplacé | relecture du code |
| F17 Notifications qui n'ouvrent pas le bon écran | P2 | Web ; 1.5.1 | Bon écran au clic, y compris au démarrage à froid et sur le web (service worker) | relecture du code |
| F18 Attribution OpenStreetMap retirée | P2 | Corrigé | Crédit rétabli et cliquable ; Leaflet vérifié par empreinte d'intégrité | empreintes recalculées |
| F19 Pages légales difficiles d'accès | P2 | Web ; 1.5.1 | Liens vers les pages légales une fois connecté, dans les deux applications | relecture du code |
| F20 Accessibilité, cohérence, optimisation | P2 | En partie | Fait : bouton glissant utilisable au lecteur d'écran (rôle et action d'accessibilité), suggestions d'adresses au clavier, statuts en français et date de course dans Recherche, recherche sans accents dans Tarifs, une seule course relue au lieu de toute la liste | relecture du code |
| F21 Offre ouverte par notification sans bouton | P2 | Web ; 1.5.1 | Offre diffusée : accepter ou refuser sur l'écran ; course devenue inaccessible signalée | relecture du code |
| F22 Mémo client affiché « non enregistré » | P3 | Corrigé | Comparaison à la dernière valeur enregistrée | relecture du code |
| F23 Messages d'une autre conversation | P2 | Corrigé | Messages vidés au changement de fil, réponse périmée ignorée, un brouillon par fil (console et applications) | relecture du code |
| F24 Dépendances des interfaces vulnérables | P2 | En partie | Console : aucune alerte dans les dépendances livrées ; applications : alerte critique (`shell-quote`) supprimée | `npm audit` (§ 6) |
| OPS-01 Dépendances du serveur | P2 | Corrigé | Correctifs compatibles, sans rétrograder ExcelJS : **aucune alerte** (`npm audit`, avec et sans dépendances de développement) | `npm audit` ; tests d'import, d'export et du limiteur verts |
| OPS-02 Politique de Nominatim | P2 | Corrigé | Une requête toutes les 1,1 seconde pour tout le serveur, file de 3, cache de 24 h, User-Agent qui identifie l'application ; écrans : 1 seconde de pause et 5 caractères sans clé Google | test |
| WEB-01 Site non indexé | P3 | Décision du propriétaire | Inchangé, volontairement : levée de la désindexation après relecture des sept pages par le propriétaire | contrôle des balises |
| WEB-02 Délai d'une heure sur le site | P2 | Corrigé | Pages Nos services, Chauffeurs, Réserver et FAQ : contact à 2 h, départ à 3 h, arrêts (5 au plus, ajoutés par Taxi Sylvain), deux points à Montréal-Trudeau au même prix ; le contrôleur du site refuse désormais toute mention d'« une heure avant » | contrôleur rouge avant publication (2 pages), vert après (7 pages) ; textes relus en ligne |
| OPS-03 Versions natives différentes du code | P2 | Accord du propriétaire | Version 1.5.1 à compiler avec son accord, puis essais sur téléphones, empreintes SHA-256 notées avant de servir les liens définitifs (PASSATION § 10, point 9) ; la version est désormais affichée en bas de l'accueil des applications | à faire |
| OPS-04 Surveillance verte malgré une panne | P2 | Corrigé | `/health` (vivant) et `/health/ready` (requête à la base bornée à 3 s, version, migration, âge des sauvegardes, état des envois sur 24 h ; 503 base en panne) ; surveillance bloquante sur `api.taxisylvain.ca` ; version et migration comparées au dépôt ; chaque site au dernier commit de son application (marque posée par `scripts/publier-web.mjs`) et appelant `api.taxisylvain.ca` ; une reprise après 3 minutes contre les fausses alertes | rouge sur l'ancienne production, vert après déploiement ; scénario OPS-04 ; `livraisons.test.js` |
| OPS-05 Recette reproductible, préproduction | P2 | Corrigé, réserve | Intégration continue à chaque envoi et demande de fusion (tests, scénarios sur base jetable, trois constructions), sans secret ni fournisseur | faille volontaire détectée ; simulation locale (UTC, base fournie, casse des imports) |
| GOV-01 Conformité vie privée à démontrer | P2 | Décision du propriétaire | Hors code : évaluation des facteurs relatifs à la vie privée, registre des incidents, durées de conservation, contrats des fournisseurs (dont l'hébergement Railway hors du Québec), avec un juriste | à faire |

## 6. Écarts assumés et limites

- **SEC-07** : les jetons gardent leur durée de 30 jours ; ni jetons courts ni renouvellement, ce qui demanderait
  de nouvelles applications installées. La révocation se fait par génération de session (changement ou
  réinitialisation du mot de passe). Pas encore de bouton « déconnecter tous les appareils ».
- **SEC-11** : l'origine d'un compte (créé par le Dispatch ou inscrit seul) se déduit encore de l'adresse technique ;
  une colonne dédiée en base reste à ajouter.
- **SEC-12 et B05** : pas d'invitation à usage unique ni d'expiration du mot de passe temporaire, pas de changement
  obligatoire à la première connexion ; le mot de passe temporaire est montré une seule fois et réinitialisable.
- **SEC-15** : la copie externe est prête mais **inactive** tant que `SAUVEGARDE_COURRIEL` et `SAUVEGARDE_CLE` ne sont
  pas posées ; les photos ne sont pas copiées hors du volume ; pas encore d'exercice de restauration périodique ni
  d'objectifs RPO et RTO écrits (une restauration complète a été éprouvée le 6 octobre sur base jetable).
- **SEC-19** : le jeton d'export reste utilisable pendant ses 5 minutes (pas à usage unique). L'ancien paramètre
  `?token=` reste accepté pour les applications 1.4.0 et 1.5.0 déjà installées : à retirer quand la 1.5.1 les aura
  remplacées.
- **F14** : la version web garde la session dans le stockage du navigateur ; pas de liens profonds ni d'historique
  de navigation dans la console.
- **F20** : restent le piégeage du focus dans les fenêtres de la console, les étiquettes reliées aux champs
  (`htmlFor`), `KeyboardAvoidingView` sur mobile, la mesure des contrastes, et l'historique du tableau de bord.
- **F24 et dépendances** : la console garde 2 alertes dans le serveur de développement de Vite 5 (pas dans le site
  livré) : Vite 8 ne s'installe pas sous Windows (module natif de rolldown manquant), passage à reprendre. Les
  applications gardent 37 (chauffeur) et 38 (client) alertes, aucune critique, toutes dans l'outillage de
  construction d'Expo SDK 54 (`braces`, `image-size`, `node-forge`, `postcss`, `source-map-js`, `sprintf-js`, `uuid`),
  pas dans le code exécuté chez les utilisateurs ; npm ne propose que des changements majeurs, qui reviennent au
  passage à Expo SDK 55.
- **OPS-05** : pas d'environnement de préproduction (deuxième environnement Railway, coût à approuver) ni de matrice
  d'appareils.
- **Compatibilité** : le serveur corrigé reste compatible avec les applications installées (jetons sans `sv` valant la
  génération 0, ancienne annulation traitée comme une libération, `ride:updated` conservé, moyenne vide affichée par
  l'ancien repli des applications).
- **Pas d'essai matériel** : comme pour l'audit, aucun essai sur un vrai téléphone, aucun appel Twilio réel, aucune
  notification réelle pendant les essais.

## 7. Ce qui attend le propriétaire

1. Accord pour compiler la version 1.5.1 (Android et iPhone), puis essais sur téléphones (OPS-03, série F).
2. Poser `SAUVEGARDE_COURRIEL` et `SAUVEGARDE_CLE` sur Railway (marche à suivre : PASSATION § 6).
3. Décider B18 (escalade d'un chauffeur en route qui paraît hors ligne), WEB-01 (indexation du site), GOV-01
   (dossier vie privée avec un juriste), et la préproduction.
4. Savoir que les collaborateurs ne voient plus que les pages de leurs permissions (la Messagerie demande la
   permission « Messagerie / Groupes »).

## 8. Revérifier soi-même

```bash
cd backend && npm test                                   # 343 tests
node test-e2e/audit-2026-10-07.mjs                       # 24 vérifications (PostgreSQL local, PG_BIN)
node test-e2e/scenario-2026-10-06.mjs                    # 10 vérifications
cd .. && node scripts/verifier-mise-en-ligne.mjs         # production : tout au vert attendu
curl https://api.taxisylvain.ca/health/ready             # base, version, migration, sauvegardes, envois
```
