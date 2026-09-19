# Conformité Google Play et App Store — Taxi Sylvain

Document pour le propriétaire. Il sert à publier les deux applications (Chauffeur et Client) sur
Google Play et sur l'App Store d'Apple. Chaque étape est écrite pour être faite par vous, sans
développeur.

**État au 18 septembre 2026 :** le code est écrit, **rien n'est encore en ligne** et **rien n'a été
soumis à un magasin**. Aucun compte Apple ni Google Play n'a été créé. Tant que la nouvelle version
de l'API n'est pas déployée avec votre accord, les adresses publiques listées ici ne répondent pas
encore.

À lire aussi : `docs/PASSATION.md` (état complet du projet) et `AGENTS.md` (règles de travail).

---

## 1. Ce qui est fait dans le code

| Élément | État | Où c'est |
|---|---|---|
| « Supprimer mon compte » dans l'app Chauffeur | Fait dans le code, pas encore en ligne | Écran d'accueil, bas du menu |
| « Supprimer mon compte » dans l'app Client | Fait dans le code, pas encore en ligne | Écran de réservation, bas du menu |
| Page web publique de suppression | Faite dans le code, pas encore en ligne | servie par l'API |
| Politique de confidentialité | Faite dans le code, pas encore en ligne | servie par l'API |
| Conditions d'utilisation | Faites dans le code, pas encore en ligne | servie par l'API |
| Compte d'entreprise Google Play | **À créer par vous** | 25 USD, une seule fois |
| Compte Apple Developer | **À créer par vous** | 99 USD par an |
| Captures d'écran et textes de présentation | **À préparer** | voir § 4 |

### Les adresses exactes à donner aux magasins

| Page | Adresse à coller | Adresse de rechange en anglais |
|---|---|---|
| Suppression de compte | `https://backend-production-03f0b.up.railway.app/suppression-compte` | `.../delete-account` |
| Politique de confidentialité | `https://backend-production-03f0b.up.railway.app/confidentialite` | `.../privacy` |
| Conditions d'utilisation | `https://backend-production-03f0b.up.railway.app/conditions` | `.../terms` |

Les deux adresses d'une même ligne mènent exactement au même texte. Certains formulaires de Google et
d'Apple demandent une adresse en anglais : c'est à ça que servent celles de la colonne de droite.

> **Important.** Ces adresses contiennent le nom technique de l'hébergeur Railway. Elles
> fonctionnent, mais elles font amateur sur une fiche de magasin. **Le jour où vous aurez votre
> propre nom de domaine** (par exemple `taxisylvain.com`), ces adresses deviendront
> `https://taxisylvain.com/suppression-compte`, et ainsi de suite. Il faudra alors les remplacer dans
> Google Play Console et dans App Store Connect. C'est une modification de deux minutes dans chaque
> console, mais il ne faut pas l'oublier : une adresse de politique de confidentialité qui ne répond
> plus fait retirer une application.

### Comment la suppression fonctionne, si un magasin vous pose la question

- La personne entre son **mot de passe actuel** pour confirmer. Dans l'app elle est déjà connectée ;
  sur la page web elle entre son courriel et son mot de passe.
- Un **client** et un **chauffeur** peuvent supprimer leur compte eux-mêmes.
- Le compte **Dispatch** (le vôtre) ne peut jamais être supprimé de cette façon : cela fermerait
  l'entreprise.
- Un compte **administrateur** ne se supprime pas lui-même : il vous le demande.
- La suppression est **refusée tant qu'une course est en cours** (chauffeur accepté, en route, ou
  course démarrée), que la personne soit le client ou le chauffeur.
- **Ce qui est effacé :** le compte et les informations personnelles (nom, courriel, téléphone,
  adresse, photos, mémo), les messages envoyés, les notations, la cédule, les groupes créés et le
  jeton de notification.
- **Ce qui est conservé :** les courses passées restent dans vos registres, mais **ne sont plus
  reliées à personne**. C'est une obligation comptable : la redevance de 10 % doit rester
  justifiable.
- La suppression est **immédiate et définitive**. Aucune récupération n'est possible.

---

## 2. Google Play — liste à suivre

### 2.1 Le compte d'entreprise, à faire en premier

1. Allez sur `https://play.google.com/console` et créez un compte **développeur**.
2. Choisissez **« Organisation »** et non « Personnel ». Un compte personnel affiche votre nom sur la
   fiche ; un compte d'organisation affiche « Taxi Sylvain ».
3. Payez les **25 USD**. C'est un paiement unique, pas un abonnement.
4. Google demande de **vérifier l'identité de l'entreprise** : numéro d'entreprise du Québec (NEQ),
   adresse, et un **numéro D-U-N-S** pour les organisations. Le D-U-N-S est gratuit, il se demande
   chez Dun & Bradstreet, et il faut compter **jusqu'à 30 jours**. Demandez-le tout de suite : c'est
   le même numéro qui servira pour Apple (§ 3.4).
5. Google demande aussi un **courriel de contact public**, visible sur la fiche. Utilisez un courriel
   professionnel (`info@votredomaine.com`), pas une adresse personnelle.

**Comptez de 2 à 6 semaines** entre la création du compte et la première publication, à cause des
vérifications d'identité. Commencez par là, avant les captures d'écran.

### 2.2 Où coller l'adresse de la politique de confidentialité

Deux endroits, et il faut les deux :

- **Play Console → votre application → Contenu de l'application → Politique de confidentialité.**
  Collez `https://backend-production-03f0b.up.railway.app/confidentialite`, puis **Enregistrer**.
- **Play Console → Développer la présence → Fiche Play Store principale**, champ
  **« URL de la politique de confidentialité »** quand il apparaît.

Ensuite, ouvrez l'adresse vous-même dans un navigateur, sur votre téléphone, pour vérifier qu'elle
s'affiche. Google la teste automatiquement : si elle ne répond pas, l'application est refusée.

### 2.3 Où déclarer la suppression de compte

**Play Console → votre application → Contenu de l'application → Suppression du compte.**

Répondez ceci :

| Question de Google | Votre réponse |
|---|---|
| Les utilisateurs peuvent-ils créer un compte dans l'application ? | **Oui** |
| Offrez-vous un moyen de demander la suppression du compte ? | **Oui** |
| Adresse web de la suppression de compte | `https://backend-production-03f0b.up.railway.app/suppression-compte` |
| La suppression est-elle possible depuis l'application ? | **Oui** — écran d'accueil, lien « Supprimer mon compte » |
| Certaines données sont-elles conservées après la suppression ? | **Oui** |
| Lesquelles et pourquoi ? | le texte ci-dessous |

Texte à coller dans la case « données conservées » (Google accepte le français ; ajoutez la version
anglaise si le formulaire l'exige) :

> Le compte et toutes les informations personnelles (nom, courriel, téléphone, adresse, photos,
> messages, notations) sont supprimés immédiatement et définitivement. Les courses déjà effectuées
> sont conservées dans les registres comptables de l'entreprise, sans aucun lien avec la personne
> supprimée : ni nom, ni courriel, ni téléphone. Cette conservation répond à une obligation
> comptable liée à la redevance de 10 % versée par les chauffeurs.

**Le piège à éviter :** l'adresse que vous donnez doit permettre de supprimer le compte **sans
installer l'application**. C'est exactement pour ça que la page web existe. Ne mettez jamais à cet
endroit un simple formulaire de contact ou une adresse courriel : Google refuse.

### 2.4 Le formulaire « Sécurité des données »

**Play Console → Contenu de l'application → Sécurité des données.** C'est un long questionnaire.
Voici des réponses prêtes, fondées sur ce que les applications font réellement aujourd'hui.

Réponses générales, valables pour les deux applications :

| Question | Réponse |
|---|---|
| Les données sont-elles chiffrées en transit ? | **Oui**, tout passe en HTTPS |
| Offrez-vous un moyen de demander la suppression des données ? | **Oui** |
| Toutes les données collectées sont-elles facultatives ? | **Non**, le compte exige nom, courriel et téléphone |
| Vendez-vous ou partagez-vous des données avec des tiers ? | **Non** |
| L'application affiche-t-elle de la publicité ? | **Non** |
| Y a-t-il un outil de mesure d'audience ? | **Non** |
| Y a-t-il des paiements dans l'application ? | **Non**, le paiement se fait hors de l'application |

#### App Client, catégorie par catégorie

| Catégorie Google | Collectée ? | Partagée ? | Chiffrée en transit | Suppression possible | Pourquoi |
|---|---|---|---|---|---|
| Nom | Oui, obligatoire | Non | Oui | Oui | Le chauffeur doit savoir qui il prend en charge |
| Adresse courriel | Oui, obligatoire | Non | Oui | Oui | Connexion au compte et confirmations de course |
| Numéro de téléphone | Oui, obligatoire | Non | Oui | Oui | Vous joindre si la course pose problème. **Jamais transmis au chauffeur** |
| Adresse postale | Oui, facultative | Non | Oui | Oui | Adresse de départ enregistrée, pour réserver plus vite |
| Position précise ou approximative | **Non collectée** | — | — | — | L'app Client ne demande jamais la position de l'appareil |
| Messages dans l'application | Oui | Non | Oui | Oui | Messagerie entre le client et le chauffeur |
| Photos ou vidéos | **Non collectées** | — | — | — | L'app ne demande ni l'appareil photo ni la galerie |
| Autre contenu : notations, commentaires | Oui, facultatif | Non | Oui | Oui | Noter la course |
| Identifiants d'appareil | Oui | Non | Oui | Oui | Jeton de notification, pour prévenir de l'arrivée du chauffeur |
| Informations financières | **Non collectées** | — | — | — | Aucun paiement dans l'application |
| Contacts, agenda, historique de navigation, santé, fichiers | **Non collectés** | — | — | — | — |

Pour chaque ligne collectée, cochez comme raison **« Fonctionnalité de l'application »** et
**« Gestion du compte »**. Ne cochez jamais « Publicité » ni « Analyse ».

#### App Chauffeur, les différences

Mêmes réponses que l'app Client, avec **trois différences importantes** :

| Catégorie Google | Collectée ? | Partagée ? | Chiffrée en transit | Suppression possible | Pourquoi |
|---|---|---|---|---|---|
| **Position précise** | **Oui**, y compris en arrière-plan | Non, voir la note | Oui | Oui | Suivre le chauffeur en direct pendant une course |
| Photos ou vidéos | **Non collectées par l'application** | — | — | — | La photo du chauffeur et celle de la voiture sont téléversées par Taxi Sylvain depuis la console Dispatch, jamais depuis le téléphone |
| Autre contenu : notations reçues | Oui | Non | Oui | Oui | Notation donnée par le client |

**Note sur le partage de la position.** Répondez **« Non partagée »** : vous ne vendez ni ne
transmettez la position à une autre entreprise. Pendant une course, elle est visible par le Dispatch
et par le client de cette course — c'est le fonctionnement même du service, et c'est expliqué dans la
politique de confidentialité. Ce qui compte, c'est que la réponse du formulaire et le texte de la
politique disent la même chose.

**Point favorable à déclarer, et c'est la vérité.** Si le formulaire demande si la position est
*conservée* : répondez **« collectée mais non stockée »**. La position du chauffeur n'est écrite
**nulle part dans la base de données**. Elle passe en direct vers la carte, reste quelques instants
dans la mémoire du serveur pour que la carte s'affiche tout de suite quand on l'ouvre, puis
disparaît dès que la course se termine. C'est un point en votre faveur auprès de Google : dites-le.
*(Vérifié dans `backend/src/lib/driverLocations.js` : une simple liste en mémoire, vidée à la fin de
chaque course.)*

**Si le code change un jour** — par exemple si on ajoute l'envoi de photos depuis le téléphone — ce
formulaire doit être repris. Une réponse devenue fausse est un motif de retrait de l'application.

### 2.5 La localisation en arrière-plan, le point le plus souvent refusé

C'est **la cause numéro un de refus** pour une application de taxi. Un employé de Google vérifie ce
point à la main, et refuse quand la justification est vague.

**Où :** Play Console → Contenu de l'application → **Autorisations sensibles → Localisation en
arrière-plan**.

**Texte à coller dans la justification** (ajoutez la version anglaise si elle est demandée) :

> Taxi Sylvain est une application de répartition de taxi et de transferts vers l'aéroport, réservée
> aux chauffeurs de l'entreprise. La position en arrière-plan est utilisée uniquement pendant une
> course active, c'est-à-dire entre le moment où le chauffeur part chercher le client et le moment
> où il le dépose à destination.
>
> Pendant ce temps, le chauffeur conduit en suivant Waze ou Google Maps, donc l'application Taxi
> Sylvain n'est plus à l'écran. Sans la position en arrière-plan, le suivi s'arrête : le répartiteur
> ne sait plus où est son chauffeur et le client ne voit plus le taxi approcher sur la carte. La
> sécurité du chauffeur en dépend aussi : en cas de problème pendant une course, le répartiteur doit
> pouvoir le localiser.
>
> Le suivi démarre lorsque le chauffeur appuie sur « En route » et s'arrête automatiquement lorsqu'il
> appuie sur « Terminer ». Aucune position n'est enregistrée en dehors d'une course. Une notification
> permanente indique au chauffeur que sa position est partagée. Les chauffeurs sont des partenaires
> de l'entreprise, informés et consentants. La position n'est jamais vendue ni transmise à une
> entreprise tierce.

**Pourquoi ce texte fonctionne :** il dit *quand* (pendant une course seulement), *pourquoi* (le
chauffeur navigue avec une autre application), *ce qui arrive sans* (plus de suivi du tout), et
*comment ça s'arrête*. C'est exactement ce que fait le code : le suivi est piloté par les étapes
« En route » et « Démarrée », avec une notification permanente orange qui affiche « Taxi Sylvain —
course en cours ».

**La vidéo de démonstration est obligatoire.** Google demande le lien d'une vidéo non répertoriée sur
YouTube, ou d'un fichier Google Drive partagé par lien. Elle doit montrer, dans l'ordre :

1. La connexion d'un chauffeur dans l'application.
2. L'acceptation d'une course.
3. L'appui sur **« En route »**, et l'écran Android qui demande la position, avec le choix
   **« Toujours autoriser »**.
4. Le fait de quitter l'application par le bouton d'accueil, et la **notification permanente** qui
   reste affichée.
5. La position qui bouge sur la console Dispatch pendant ce temps.
6. L'appui sur **« Terminer »**, et la notification qui disparaît.

Deux à trois minutes suffisent. Filmez l'écran du téléphone directement : Android enregistre l'écran
depuis le panneau des réglages rapides. **Pas de musique, pas de montage.** Google veut voir le
parcours réel.

**Ne déclarez la localisation en arrière-plan que pour l'application Chauffeur.** L'application
Client ne demande jamais la position. La déclarer quand même déclencherait un examen inutile, qui
peut être refusé.

### 2.6 Un point technique à régler avant le premier dépôt

Aujourd'hui, le projet ne sait produire qu'un **APK d'essai**, en distribution interne
(`apps/driver-app/eas.json` et `apps/client-app/eas.json`, profil `preview`). C'est ce format que
vous installez à la main sur un téléphone Android.

**Google Play n'accepte pas ce format.** Le magasin exige un *App Bundle* (fichier `.aab`), produit
par un profil de compilation « production » qui n'existe pas encore dans le projet. Il faut aussi
une **clé de signature** conservée durablement : si elle est perdue, plus aucune mise à jour de
l'application ne peut être publiée.

Ce n'est pas un gros travail, mais **ce n'est pas fait**. Dites-le-moi quand vous voudrez que je le
prépare. Cela demandera une recompilation des applications, donc votre accord explicite, et le
forfait Expo actif.

### 2.7 Les autres cases de « Contenu de l'application »

À remplir aussi, elles sont rapides :

- **Accès à l'application** : les deux applications exigent un compte. Cochez que toutes les
  fonctionnalités demandent des identifiants et **donnez un compte de test** (§ 3.2 — le même compte
  sert pour Google et pour Apple).
- **Publicité** : non.
- **Classification du contenu** : questionnaire, catégorie « Voyage » ou « Utilitaires ». Répondez
  non à tout ce qui concerne violence, sexe ou jeux d'argent.
- **Public cible** : 18 ans et plus. Ne cochez jamais une tranche d'âge enfant : cela déclenche des
  règles beaucoup plus strictes.
- **Application gouvernementale** : non.
- **Fonctionnalités financières** : non, il n'y a pas de paiement dans l'application.

---

## 3. Apple / App Store

### 3.1 La suppression de compte, règle 5.1.1(v)

Depuis juin 2022, Apple **refuse** toute application qui permet de créer un compte mais pas de le
supprimer. C'était le cas de Taxi Sylvain jusqu'à maintenant.

**C'est maintenant fait dans le code, pas encore en ligne.** Quand l'équipe de revue d'Apple
demandera où se trouve la suppression, écrivez ceci dans les **Notes pour l'examen** :

> App Chauffeur : se connecter, écran d'accueil, faire défiler jusqu'au bas du menu, lien rouge
> « Supprimer mon compte ». Le mot de passe est demandé pour confirmer.
>
> App Client : se connecter, écran de réservation, faire défiler jusqu'au bas du menu, lien rouge
> « Supprimer mon compte ». Le mot de passe est demandé pour confirmer.
>
> La suppression est aussi possible sans installer l'application, à l'adresse
> https://backend-production-03f0b.up.railway.app/suppression-compte

Apple exige que la suppression soit **dans l'application**, et pas seulement sur le web. Les deux
existent maintenant. Un lien web tout seul serait refusé.

### 3.2 Le compte de démonstration pour l'équipe de revue

Apple teste l'application à la main. Sans compte de test, elle est refusée en 24 heures avec la
mention « nous n'avons pas pu dépasser l'écran de connexion ».

**Ce que vous devez faire, depuis votre console Dispatch :**

1. Créez un **compte chauffeur de test** : un nom du genre « Chauffeur Démo », un courriel que vous
   contrôlez, un mot de passe simple mais pas évident.
2. Créez un **compte client de test** de la même façon.
3. **Créez au moins une course à venir**, affectée à ce chauffeur de test, avec ce client de test.
   Sans course, l'examinateur voit une application vide et ne peut rien essayer.
4. Dans **App Store Connect → votre application → Informations sur l'app → Informations de connexion
   pour l'examen**, cochez qu'une connexion est requise et entrez les identifiants.

> **N'écrivez jamais ces identifiants dans le code, dans un document du projet, ni dans un courriel.**
> Ils se saisissent uniquement dans App Store Connect et dans Google Play Console. Ce document ne les
> contient pas, et ne doit jamais les contenir.
>
> Après la publication, **changez les mots de passe de ces deux comptes**, ou supprimez-les.

Google Play demande la même chose, dans **Contenu de l'application → Accès à l'application**.
Utilisez les mêmes deux comptes.

### 3.3 La localisation en arrière-plan chez Apple

Apple est aussi exigeante que Google, mais elle vérifie autrement : par le **texte de la fenêtre de
permission** qui s'affiche sur le téléphone. Ce texte est déjà écrit dans le code
(`apps/driver-app/app.json`) :

> Taxi Sylvain partage votre position avec le Dispatch et le client pendant une course, même lorsque
> vous naviguez avec Waze ou Google Maps.

Dans les **Notes pour l'examen**, ajoutez la même justification qu'au § 2.5. Apple demande en plus
que l'application montre un **indicateur visible** quand elle suit la position en arrière-plan :
c'est déjà le cas dans le code. Apple peut aussi demander une vidéo : celle préparée pour Google
convient.

### 3.4 L'inscription Apple Developer

1. Allez sur `https://developer.apple.com/programs/`.
2. Choisissez **« Organisation »** et non « Individu ». En individu, c'est votre nom personnel qui
   apparaît comme éditeur de l'application, pas « Taxi Sylvain ».
3. Le compte Organisation exige un **numéro D-U-N-S**, le même que pour Google Play (§ 2.1).
   Demandez-le une seule fois, il sert aux deux. Gratuit, jusqu'à 30 jours d'attente.
4. Coût : **99 USD par an**, à renouveler. Si le renouvellement est oublié, l'application disparaît
   de l'App Store.
5. Apple exige un **courriel au nom de l'entreprise**, du genre `info@votredomaine.com`. Une adresse
   Gmail personnelle est souvent refusée pour un compte Organisation. C'est une raison de plus
   d'acheter le nom de domaine en premier (§ 5).
6. Il faut un Mac ou un service de compilation à distance pour produire la version iPhone. Expo / EAS
   le fait à distance : **aucun Mac n'est nécessaire de votre côté**.

**Comptez de 1 à 4 semaines** pour la validation d'un compte Organisation.

---

## 4. Captures d'écran et fiches

### 4.1 Formats exigés par Google Play

| Élément | Format | Nombre |
|---|---|---|
| Icône de l'application | PNG 32 bits, **512 × 512**, 1 Mo maximum | 1 |
| Image de présentation (bannière) | PNG ou JPEG, **1024 × 500** | 1, obligatoire |
| Captures téléphone | PNG ou JPEG, chaque côté entre 320 et 3840 pixels, format 9:16 | minimum 2, idéalement **4 à 8** |
| Captures tablette 7 et 10 pouces | mêmes règles | recommandées |
| Titre | 30 caractères maximum | — |
| Description courte | 80 caractères maximum | — |
| Description complète | 4000 caractères maximum | — |

### 4.2 Formats exigés par Apple

| Élément | Format | Nombre |
|---|---|---|
| Icône de l'application | PNG **1024 × 1024**, sans transparence, sans coins arrondis | 1 |
| Captures iPhone 6,9 pouces | **1290 × 2796** ou 1320 × 2868 | minimum 1, jusqu'à 10 |
| Captures iPad, si l'app est offerte sur iPad | 13 pouces, 2064 × 2752 | selon le cas |
| Nom de l'app | 30 caractères maximum | — |
| Sous-titre | 30 caractères maximum | — |
| Mots-clés | 100 caractères, séparés par des virgules | — |
| Description | 4000 caractères maximum | — |
| Texte promotionnel | 170 caractères | — |

Apple redimensionne automatiquement les captures 6,9 pouces pour les autres tailles d'iPhone : une
seule série suffit.

### 4.3 Les captures à prendre — App Client

Prenez-les depuis la version web sur un téléphone, ou depuis l'application. **Utilisez le compte
client de test, jamais un vrai client.** Aucun nom, aucun numéro de téléphone et aucune adresse
réelle ne doit apparaître : c'est un motif de refus chez les deux magasins.

1. L'écran de réservation, avec une destination (Aéroport Montréal-Trudeau) et un prix affiché.
2. La carte de suivi, avec le taxi en route et la photo du chauffeur.
3. La liste des courses à venir.
4. La messagerie avec le chauffeur.
5. L'écran de notation après la course.

### 4.4 Les captures à prendre — App Chauffeur

1. L'écran d'accueil, avec une course du jour.
2. L'écran de course active, avec les boutons « En route » et « Démarrer ».
3. Le choix entre Waze et Google Maps.
4. L'écran des revenus de la semaine, avec la redevance de 10 %.
5. La messagerie avec le Dispatch.

### 4.5 Textes prêts à coller — App Client

**Titre, 30 caractères :**
`Taxi Sylvain`

**Description courte Google Play, 80 caractères :**
`Réservez votre taxi ou votre transfert aéroport, et suivez-le en direct.`

**Sous-titre Apple, 30 caractères :**
`Taxi et transferts aéroport`

**Description complète :**

> Taxi Sylvain dessert la Rive-Sud de Montréal et la région de Chambly, pour vos déplacements de tous
> les jours comme pour vos transferts vers les aéroports Montréal-Trudeau et Saint-Hubert, et vers la
> station du REM.
>
> Réserver en quelques secondes
> Choisissez votre adresse de départ, votre destination et l'heure qui vous convient. Le prix des
> transferts vers l'aéroport est connu à l'avance, sans surprise.
>
> Suivre son taxi en direct
> Dès que votre chauffeur part vous chercher, vous le voyez approcher sur la carte. Vous connaissez
> son nom, sa photo et son véhicule avant même qu'il arrive.
>
> Écrire à son chauffeur sans donner son numéro
> La messagerie est intégrée à l'application. Votre numéro de téléphone n'est jamais communiqué au
> chauffeur, et le sien ne vous est jamais communiqué.
>
> Des rappels avant le départ
> Choisissez quand vous voulez être prévenu : la veille, deux heures avant, une heure avant, ou dix
> minutes avant.
>
> Réservation par téléphone aussi
> Vous préférez parler à quelqu'un ? Appelez le 438-499-1120.

**Mots-clés Apple, 100 caractères :**
`taxi,aéroport,Trudeau,YUL,Saint-Hubert,transfert,Chambly,Rive-Sud,REM,navette,réservation`

### 4.6 Textes prêts à coller — App Chauffeur

**Titre, 30 caractères :**
`Taxi Sylvain Chauffeur`

**Description courte Google Play, 80 caractères :**
`Application réservée aux chauffeurs partenaires de Taxi Sylvain.`

**Description complète :**

> Application de travail réservée aux chauffeurs partenaires de Taxi Sylvain. Un compte fourni par
> l'entreprise est nécessaire : l'inscription libre n'est pas possible.
>
> Recevez vos courses, acceptez celles qui vous conviennent, et suivez chaque étape : en route,
> course démarrée, course terminée.
>
> Naviguez avec Waze ou Google Maps, au choix, directement depuis la course.
>
> Écrivez au répartiteur et à votre client sans échanger de numéro de téléphone.
>
> Consultez vos revenus de la semaine et la redevance de 10 %.
>
> Votre position est partagée avec le répartiteur et avec votre client uniquement pendant une course.
> Elle cesse de l'être dès que vous appuyez sur « Terminer ».

**Gardez toujours dans la description la phrase qui dit que l'application est réservée aux chauffeurs
de l'entreprise.** Sans elle, un examinateur qui ne peut pas créer de compte conclut que
l'application est cassée, et il la refuse.

---

## 5. Ce qui reste bloqué, et par quoi

| Élément | Ce que vous devez faire | Ce qui se fait ensuite |
|---|---|---|
| **Nom de domaine** | Choisir et acheter le domaine de l'entreprise, environ 20 $ par an | Adresses propres pour la politique de confidentialité et la suppression ; courriel professionnel ; on remplace les adresses Railway dans les deux consoles |
| **Courriel professionnel** | Créer `info@votredomaine.com` une fois le domaine acheté | Exigé par Apple pour un compte Organisation ; sert de contact public sur les deux fiches ; débloque aussi l'envoi des courriels de course par Brevo |
| **Numéro D-U-N-S** | Le demander chez Dun & Bradstreet, gratuit, jusqu'à 30 jours | Débloque **à la fois** le compte Google Play Organisation et le compte Apple Organisation |
| **Compte Google Play** | Créer le compte, payer 25 USD, faire vérifier l'entreprise | On remplit les formulaires du § 2 et on envoie les deux applications |
| **Compte Apple Developer** | S'inscrire comme Organisation, 99 USD par an | On produit les versions iPhone, puis TestFlight, puis l'App Store |
| **Comptes de démonstration** | Les créer depuis la console Dispatch, avec une course de test | On les saisit dans les deux consoles, jamais dans le projet |
| **Firebase** | Créer le projet avec `com.taxisylvain.driver` et `com.taxisylvain.client` | Les notifications push fonctionnent dans les APK ; voir `docs/FIREBASE-PUSH.md` |
| **Expo / EAS** | Activer le forfait Starter, ou attendre le 1er octobre 2026 | On recompile les deux applications, **seulement avec votre accord** |
| **Captures d'écran** | Les prendre avec les comptes de test, ou nous demander de les préparer | On les redimensionne aux formats exigés |
| **Vidéo de localisation** | Filmer l'écran du téléphone selon le § 2.5 | On la téléverse en non répertoriée et on colle le lien dans Play Console |

**L'ordre recommandé :** nom de domaine → courriel professionnel → numéro D-U-N-S → comptes Google et
Apple → comptes de démonstration → captures et vidéo → envoi aux magasins. Les trois premières étapes
coûtent peu mais prennent le plus de temps. Commencez par elles.

---

## 6. Avertissement

- **Ce document ne remplace pas un avis juridique.** La politique de confidentialité et les
  conditions d'utilisation décrivent honnêtement ce que le logiciel fait, mais elles n'ont pas été
  écrites par un avocat. Avant la publication, faites-les relire par un juriste, en particulier pour
  la Loi 25 du Québec sur la protection des renseignements personnels, qui impose des obligations
  précises à une entreprise québécoise qui collecte des données.
- **Les règles des magasins changent souvent**, plusieurs fois par année. Les formats de captures
  d'écran, les libellés des formulaires et les exigences de justification décrits ici sont ceux
  connus au **18 septembre 2026**. Vérifiez toujours ce que la console affiche au moment où vous la
  remplissez : c'est elle qui a raison, pas ce document.
- **Rien n'a encore été soumis.** Aucun compte n'a été créé, aucune application n'a été envoyée,
  rien n'est déployé. Tout ce qui est décrit au § 1 existe dans le code et attend votre accord pour
  être mis en ligne.
