# Architecture technique — Taxi Sylvain

## 1. Stack retenue

| Composant | Choix | Pourquoi |
|---|---|---|
| API backend | Node.js + Express | Simple, rapide à développer, large écosystème |
| Base de données | PostgreSQL + Prisma ORM | Fiable, migrations propres, bien supporté par tous les hébergeurs |
| Temps réel | Socket.io | Notifications de statut de course, chat, diffusion des courses de dernière minute |
| Auth | JWT (access token) + bcrypt | Simple à héberger soi-même, pas de dépendance à un tiers |
| Console Dispatch | React + Vite (web) | Déployable comme site web classique, aucune install requise pour Taxi Sylvain |
| App Chauffeur / App Client | React Native (Expo) | Un seul code pour iOS + Android, et permet la distribution **sans App Store/Play Store** (voir §4) |

## 2. Schéma de données (résumé — voir `backend/prisma/schema.prisma`)

- **User** : rôle CLIENT / DRIVER / DISPATCH / ADMIN (collaborateur à permissions limitées), infos de contact (jamais exposées directement à l'autre partie — voir §3), préférences de rappel, jeton push
- **Ride** (course) : adresses (+ coordonnées), montant prévu, heure de prise en charge, statut (`REQUESTED → ACCEPTED → EN_ROUTE → STARTED → COMPLETED`, ou `BROADCAST` pour une course diffusée à tous, `CANCELLED`/`REFUSED`), chauffeur affecté, client
- **Message** / **Conversation** / **GroupMessage** : messagerie liée à une course (chauffeur↔client), fil direct dispatch↔chauffeur (éventuellement rattaché à une course), groupes de discussion
- **Rating** : notation bidirectionnelle chauffeur↔client en fin de course (une seule par partie et par course)
- **Schedule** : créneaux manuels de la cédule ; les courses avec heure de prise en charge y apparaissent automatiquement
- **WeeklyReport** / **SentReminder** : récaps hebdomadaires figés par chauffeur ; trace des rappels de course déjà envoyés

## 3. Confidentialité des contacts (besoin #2 du cahier des charges)

Deux approches possibles, à décider selon budget :

1. **Chat interne uniquement** (déjà implémenté dans le code fourni) : tous les échanges texte passent par l'API/Socket.io, aucun numéro n'est jamais transmis au client final.
2. **Appel vocal masqué** : nécessite un service de "proxy téléphonique" comme **Twilio Proxy** ou **Vonage**. Le principe : chaque course génère un numéro virtuel temporaire ; quand le client ou le chauffeur appelle ce numéro, le fournisseur relie l'appel à l'autre partie sans jamais révéler les vrais numéros. C'est un service payant à l'usage (~0,01-0,05 $/minute), à intégrer côté backend (`POST /api/rides/:id/call` dans le code fourni est un point d'ancrage à compléter).

## 4. Distribution des apps mobiles hors App Store / Play Store

Trois options, du plus simple au plus robuste :

1. **PWA (Progressive Web App)** — la plus simple et gratuite. L'app tourne dans le navigateur et s'installe via "Ajouter à l'écran d'accueil". Fonctionne bien sur Android ; sur iOS (Safari 16.4+) les notifications push sont maintenant supportées mais avec certaines limites. Aucune revue Apple/Google requise, mise à jour instantanée.
2. **Distribution interne via Expo (EAS Build) + Apple Enterprise Program** — permet d'installer un vrai binaire natif directement (fichier .ipa / .apk), sans passer par les stores. Le programme Apple Developer Enterprise coûte 299 $ US/an mais autorise une distribution illimitée à vos propres employés/chauffeurs (pas au grand public — donc parfait pour l'app Chauffeur, moins adapté à l'app Client destinée au grand public).
3. **APK Android en installation directe** ("sources inconnues") — gratuit et simple pour Android seulement ; l'utilisateur doit activer une option de sécurité pour installer un .apk hors Play Store.

**Recommandation pratique** : App Chauffeur (usage interne, contrôlé) → Apple Enterprise Program + APK direct Android. App Client (grand public) → PWA, plus simple à faire adopter, ou lancement classique sur les stores pour la version client si l'app doit atteindre un large public (le grand public a l'habitude d'installer via les stores officiels).

## 5. Cartographie / navigation (besoin #1)

Ne pas réimplémenter un GPS : ouvrir l'app installée du chauffeur via un lien profond ("deep link") :
- Waze : `https://waze.com/ul?ll={lat},{lng}&navigate=yes`
- Google Maps : `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`

Pour l'affichage de la carte et de la distance/ETA dans l'app elle-même (suivi client en temps réel, calcul automatique de distance) : **Google Maps Platform** (Directions API + Maps SDK), facturé à l'usage avec un crédit mensuel gratuit. Alternative moins chère : Mapbox.

## 6. Notifications push

**Expo Push Notifications** (gratuit, intégré à Expo) pour l'app Chauffeur et l'app Client. Pour la console Dispatch (web), utiliser les notifications navigateur (Web Push) ou simplement le flux temps réel Socket.io déjà en place (suffisant si le dispatcher garde la console ouverte).

## 7. Hébergement suggéré (ordre de grandeur, à valider)

| Élément | Option simple | Coût approx. |
|---|---|---|
| API + Socket.io | Railway ou Render | ~7-25 $/mois |
| PostgreSQL | Railway/Render managé, ou Supabase | ~0-25 $/mois |
| Console Dispatch (web) | Vercel ou Netlify | Gratuit à faible trafic |
| Build mobile | Expo EAS Build | Gratuit (limité) à ~29 $/mois selon volume |
| Cartes | Google Maps Platform | Crédit gratuit mensuel, puis à l'usage |
| Masquage d'appel (optionnel) | Twilio Proxy | À l'usage (~0,01-0,05 $/min) |

## 8. Sécurité — points essentiels avant mise en production

- Ne jamais exposer le numéro de téléphone réel d'un client ou chauffeur dans une réponse API destinée à l'autre partie.
- Toutes les routes sensibles protégées par JWT + vérification du rôle (voir `backend/src/middleware/auth.js`).
- Chiffrement en transit (HTTPS) obligatoire en production.
- Limiter le taux de requêtes (rate limiting) sur les routes d'authentification.

## 9. Ce qu'il reste à faire pour une vraie mise en production

- Paiement en ligne (Stripe Connect est adapté à un modèle avec redevance/commission comme le 10 % de Taxi Sylvain)
- Vérification d'identité des chauffeurs (upload de documents)
- Tests automatisés et CI/CD
- Conformité (facturation, taxes de transport selon la réglementation québécoise du transport rémunéré de personnes)
