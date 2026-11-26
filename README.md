# Planning Neuro-Anesthésie-Réanimation

Site web (mobile et ordinateur) où chaque anesthésiste choisit ses initiales et voit ses postes par jour, semaine ou mois.

## Ajouter le planning d'un nouveau mois

1. Sur la page du dépôt GitHub, ouvrez le dossier **`plannings`**.
2. Cliquez sur **Add file → Upload files** et déposez le fichier du mois (PDF exporté depuis Word, ou le fichier Word `.docx`).
3. Cliquez sur **Commit changes**.

Le site se met à jour tout seul en 1 à 2 minutes (onglet **Actions** pour suivre). Si un fichier ne peut pas être lu, la mise à jour s'arrête, GitHub vous envoie un e-mail et le site garde la version précédente.

Pour corriger un mois, déposez le fichier corrigé sous **le même nom** : il remplace l'ancien. Le mois et l'année sont lus dans le tableau (« Janvier 2027 » en haut à gauche), le nom du fichier est libre. Évitez de garder deux fichiers pour le même mois.

Un fichier déposé dans `plannings` est publié pour tout le service : personne d'autre n'a rien à importer.

Avant de déposer un fichier, vous pouvez le vérifier en ouvrant l'adresse du site suivie de `?gestion` (par exemple `https://…github.io/planning-nar/?gestion`). Une zone « Vérifier un nouveau planning » apparaît en bas de page ; cet aperçu reste sur votre appareil et ne publie rien. Les autres médecins ne voient pas cette zone.

## Modifier une case (tout le service)

Une fois la base Supabase branchée (voir plus bas), chacun peut changer un nom : vue **Jour**, toucher le poste dans « Équipe du jour », saisir les initiales, puis **Enregistrer pour tous**. Il faut ses propres initiales et le **code du service**. La case modifiée porte un point ; en la touchant on voit qui l'a modifiée et ce qui était prévu, et on peut revenir au planning d'origine. La rubrique « Dernières modifications » garde l'historique.

Les modifications restent en place si vous redéposez le fichier du mois. Pour les effacer, ou pour changer le code du service, voir les commandes en fin de `supabase/installation.sql`.

### Brancher Supabase (une seule fois)

1. Créer un compte sur supabase.com, puis **New project** (région Europe, par exemple Paris).
2. **SQL Editor → New query** : coller `supabase/installation.sql`, remplacer `CHANGEZ-MOI` par le code du service, **Run**.
3. **Project Settings → API** : copier l'URL du projet et la clé **anon public** dans `config.js`, puis enregistrer le fichier sur GitHub.

Sans `config.js` rempli, le site reste en lecture seule.

## Notification la veille sur le téléphone

Chaque soir vers 18 h (19 h en été), chaque médecin abonné reçoit sur son téléphone une notification avec ses postes du lendemain, par exemple « Demain, lundi 14 décembre : Bloc 2 (après-midi) · Astreinte ». Les modifications faites dans l'application sont prises en compte. Toucher la notification ouvre son planning.

**Pour chaque médecin** (une fois, sur son téléphone) :
- **Android** : ouvrir le site dans Chrome, choisir ses initiales, toucher **Me prévenir la veille** et accepter les notifications.
- **iPhone** (iOS 16.4 ou plus récent) : ouvrir le site dans Safari, **Partager → Sur l'écran d'accueil**, puis ouvrir le planning **depuis cette icône**, choisir ses initiales et toucher **Me prévenir la veille**. Sur iPhone, les notifications ne marchent pas depuis Safari directement.

### Mise en route (une seule fois, par le gestionnaire)

1. Ouvrir le site suivi de `?gestion`, puis **Créer les clés de notification** (en bas de page).
2. Copier la **clé publique** dans `config.js` (`vapidPublicKey`) et enregistrer le fichier sur GitHub.
3. Dans le dépôt GitHub : **Settings → Secrets and variables → Actions → New repository secret**, créer :
   - `VAPID_PRIVATE_KEY` : la **clé privée** affichée à l'étape 1 ;
   - `SUPABASE_SERVICE_KEY` : dans Supabase, **Project Settings → API → clé service_role**.
4. Essayer : onglet **Actions → Rappels de la veille → Run workflow**, case « Mode essai » cochée : le journal montre les notifications prévues sans les envoyer.

Ne recréez pas les clés ensuite : tous les téléphones devraient se réabonner. Les clés privées restent dans les secrets de GitHub et n'apparaissent ni sur le site ni dans le dépôt.

## Format du tableau

Colonnes reconnues, dans n'importe quel ordre : Réa 1 à Réa 4, Bloc 1 à Bloc 3, Radio TDM (« TDM »), Radio (« Rx » ou « Radio »), Consultation matin et après-midi, Garde, Astreinte. Une ligne par jour : « Lundi 4 », « Mardi 5 »…

- `X / Y` : X le matin, Y l'après-midi.
- `-0-` : poste fermé.
- Les anciens tableaux sans colonne TDM (décembre 2026) restent lisibles : en Radio, `X-Y` veut dire X en radio et Y au TDM, et dans la colonne Consultation unique, `X / Y` donne X le matin et Y l'après-midi, un nom seul correspond à l'après-midi.

## Mise en route (une seule fois)

Dans **Settings → Pages**, choisir **Source : GitHub Actions**. L'adresse du site s'affiche ensuite en haut de cette page.

Sur un compte GitHub gratuit, le site publié est **public** même si le dépôt est privé : toute personne qui a l'adresse peut voir le planning (initiales uniquement).

## Pour les développeurs

- `index.html` : l'application (aucune étape de compilation).
- `parser.js` : lecture des tableaux PDF et Word, partagée entre la page et le script de publication.
- `config.js` : adresse et clé publique de la base Supabase, clé publique des notifications.
- `supabase/installation.sql` : tables, règles d'accès et fonction `modifier` (vérifie le code du service).
- `sw.js`, `manifest.webmanifest`, `icons/` : installation sur l'écran d'accueil et affichage des notifications.
- `scripts/rappels.cjs` et `.github/workflows/rappels.yml` : notifications de la veille (`ESSAI=1 DATE_RAPPEL=2026-12-03 npm run rappels` pour tester).
- `scripts/build.cjs` : lit `plannings/` et écrit `site/data/plannings.json` (`npm ci && npm run build`).
