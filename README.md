# Psychologue Virtuel — Backend

Repository: Psycho-virtuel backend (Node.js + Express + MongoDB)

Ce fichier décrit le projet, comment le lancer, l'architecture générale et les composants importants.

## Aperçu
Psychologue Virtuel est une API backend qui fournit :
- Authentification (JWT + OAuth providers)
- Traitement de sessions vocales (upload de fichier audio -> traitement)
- Gestion des abonnements (Subscription model)
- Paiements / webhooks Stripe
- Système de notifications (in-app + queue pour email/push)
- Système de notation des sessions (AdviceRating)
- Challenges hebdomadaires et leaderboard
- Génération de synthèses hebdomadaires
- Jobs d'arrière-plan (weekly summary, inactivity reminders, notification delivery worker)
- Documentation API via Swagger UI

Langage/stack : Node.js (>=18), Express 5, MongoDB via Mongoose.

## Structure principale du projet
- `src/` : code source
	- `app.js` : configuration Express, middlewares, routes, swagger
	- `server.js` : bootstrap de l'app, connexion DB, démarrage des jobs
	- `config/` : configuration (database, passport, index)
	- `controllers/` : contrôleurs des routes (auth, billing, voice, notification, weeklyChallenge, etc.)
	- `models/` : modèles Mongoose (User, Subscription, Notification, NotificationQueue, WeeklySummary, WeeklyChallenge, AdviceRating, Session, ...)
	- `routes/` : déclarations des routes et regroupements
	- `services/` : logique métier réutilisable (notification.service, notificationDelivery.service, weeklySummary.service, stripe.service, etc.)
	- `jobs/` : tâches planifiées (weeklySummary.job, inactivity.job, notificationDelivery.job)
	- `middleware/` : middlewares (auth, error, upload, premium limits, validation)
	- `utils/` : helpers (logger, apiError, apiResponse, socket helper)
	- `validators/` : validation des requêtes
- `tests/` : tests (à compléter)
- `uploads/` : fichiers uploadés (sessions audio, etc.)
- `package.json` : dépendances + scripts
- `src/swagger.json` : OpenAPI spec (accessible via `/api-docs`)

## Installation et dépendances
Prérequis : Node.js >= 18, npm >= 9 (recommandé), MongoDB accessible.

Installer les dépendances :

```bash
npm install
```

Scripts utiles :
- `npm run dev` : démarre en mode développement (nodemon) — lit `.env.development`.
- `npm start` : démarre en mode production (`node src/server.js`).
- `npm run lint` / `npm run lint:fix` : linting
- `npm run format` : formatage via Prettier

## Variables d'environnement (exemples)
Créez un fichier `.env.development` (ne pas committer avec les secrets). Variables principales :

```
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/psycho
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
# Stripe
STRIPE_SECRET=sk_test_...
# SMTP (optionnel pour emails)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=login
SMTP_PASS=password
SMTP_FROM=no-reply@example.com
# Notification worker
NOTIF_WORKER_INTERVAL_SEC=5
# Weekly jobs schedule
WEEKLY_SUMMARY_DAY=1
WEEKLY_SUMMARY_HOUR=3
WEEKLY_SUMMARY_MINUTE=0
# Limits & features
FREE_MESSAGES_PER_SESSION=10
FREE_SESSION_COOLDOWN_MINUTES=60
INACTIVITY_DAYS=14
```

Adaptez selon votre environnement.

## Démarrage local rapide
1. Installer dépendances : `npm install`
2. Démarrer MongoDB
3. Créer `.env.development` avec les variables ci-dessus
4. Lancer en dev :

```bash
npm run dev
```

4. Accédez aux endpoints :
- API root : `http://localhost:3000/`
- Swagger UI : `http://localhost:3000/api-docs`
- Raw spec : `http://localhost:3000/swagger.json`

## Documentation API (Swagger)
Le projet fournit un fichier OpenAPI minimal `src/swagger.json` et l'UI Swagger est montée sur `/api-docs` si `swagger-ui-express` est installé. Vous pouvez étendre `src/swagger.json` ou remplacer par génération automatique via `swagger-jsdoc`.

### Protection de la doc
En production, protégez `/api-docs` (par ex. middleware vérifiant un token admin ou IP allowlist).

## Authentification
- JWT pour la majorité des routes protégées. Les middlewares `src/middleware/auth.middleware.js` gèrent `protect` et `authorize`.
- OAuth providers : Passport configuration dans `src/config/passport.js`.

## Principaux modèles et responsabilités
- `User` : compte utilisateur. Depuis la refactorisation, _premium_ est géré via la collection `Subscription` (référencée depuis `User.subscription`) plutôt que champs primitifs.
- `Subscription` : document d'abonnement (tier, startsAt, expiresAt, autoRenew, metadata). Méthode utilitaire `isActiveNow()`.
- `Session` : session de la voix — stocke métadonnées, transcript, etc.
- `AdviceRating` : note que l'utilisateur peut donner à une session (1-5 + commentaire). Index unique `user+session`.
- `WeeklySummary` : résumé hebdomadaire généré par job (nombre de sessions, moyenne des notes, émotions prédominantes, résumé texte, etc.).
- `WeeklyChallenge` : quiz hebdomadaire, participants, leaderboard.
- `Notification` : notifications persistantes pour chaque utilisateur (in-app + metadata). Champs: `type`, `title`, `body`, `payload`, `read`, `channel`, `sentAt`, `deliveredAt`.
- `NotificationQueue` : queue persistante pour la livraison async (email/push). Champs: `notification`, `channel`, `status`, `attempts`, `availableAt`.

## Notification pipeline
- `notification.service` : crée notifications et enfile en `NotificationQueue` si livraison externe nécessaire ou si `sendNow`.
- `notificationDelivery.service` : worker qui traite `NotificationQueue` (envoi SMTP si configuré via nodemailer, stub push support pour l'instant). Gère retries/backoff.
- `notificationDelivery.job` : interval job qui lance le traitement périodique.
- `utils/socket.js` : gestion simple de socket.io et fonctions `emitToUser` pour push realtime.

### A noter
- Actuellement le worker envoie des emails si `SMTP_HOST` est configuré. L'intégration push (FCM/OneSignal) est prévue mais laissée comme extension.
- Pour la montée en charge, on recommande d'utiliser une queue dédiée (BullMQ + Redis) et des workers séparés.

## Jobs et cron
- `weeklySummary.job` : génère automatiquement les résumés hebdomadaires pour tous les utilisateurs selon la configuration.
- `inactivity.job` : notifie les utilisateurs inactifs.
- `notificationDelivery.job` : traite la file des notifications.

Ces jobs sont démarrés automatiquement par `src/server.js` au lancement.

## Websockets (Realtime)
- `src/utils/socket.js` initialise `socket.io` sur le serveur si la dépendance est installée.
- Recommandation : sécuriser la connexion socket par token (JWT) au lieu de `userId` en query string. Le helper actuel est simple et doit être renforcé pour la production.

## Routes principales
- `/api/v1/auth/*` : inscription, connexion, refresh, profile
- `/api/v1/voice/*` : upload et traitement de la session vocale
- `/api/v1/billing/*` : endpoints Stripe (webhook public), gestion d'abonnement côté serveur
- `/api/v1/notifications/*` : lister, marquer comme lu, unread-count
- `/api/v1/challenges/*` : créer/lister/soumettre challenges
- `/api/v1/sessions/:id/rate` : noter une session

Regardez `src/routes` pour la liste complète et les middlewares appliqués.

## Développement et contributions
- Linting : `npm run lint` et `npm run format`.
- Tests : ajouter des tests dans `tests/`.
- Pour les grosses modifications (ex: changes DB), ajouter une migration script pour transformer anciens `isPremium`/`premiumExpiresAt` en `Subscription` documents.

## Déploiement
- Utilisez un process manager (pm2, systemd) ou Docker.
- Pour Docker, créez une image Node + variable d'env et pointez la base MongoDB distante.
- Assurez-vous de configurer `SMTP_*`, `STRIPE_SECRET` et les credentiels secrets en variables d'environnement.

## Dépannage courant
- Erreur `ETARGET` lors de `npm install` : vérifier les versions dans `package.json` (j'ai fixé une version valide pour `swagger-ui-express`).
- Problèmes de CORS en production : vérifier `config.frontendUrl` ou config CORS dans `src/app.js`.
- Jobs ne tournent pas : vérifiez que `src/server.js` a bien démarré les jobs et que le processus est vivant.
- Notifications non envoyées : vérifier `NotificationQueue` et logs du worker; si vous utilisez SMTP, vérifier `SMTP_*`.

## Sécurité
- Ne stockez jamais `.env.*` dans le dépôt.
- Protégez les endpoints d'administration (création de challenge, exécution de jobs manuels).
- Ajoutez rate-limiting là où nécessaire (déjà configuré sur `/api/*`).

## Prochaines améliorations suggérées
- Externaliser les jobs dans une plateforme de queue (Redis + BullMQ) pour robustesse et scalabilité.
- Intégrer une solution push mobile (FCM / OneSignal) pour les notifications push.
- Générer automatiquement la documentation OpenAPI depuis les JSDoc des contrôleurs (`swagger-jsdoc`) afin de garder la spec synchronisée.
- Ajouter tests automatiques et CI (GitHub Actions).

## Contact
- Mainteneurs : `Med Youssef Laribi` 
---




### running webhook
stripe listen --forward-to localhost:5000/api/v1billing/webhook
stripe trigger checkout.session.completed
