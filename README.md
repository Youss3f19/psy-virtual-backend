# Psychologue Virtuel - Backend API

API REST professionnelle pour l'application Psychologue Virtuel avec authentification complète (locale + Google OAuth).

## Démarrage rapide

### Prérequis

- Node.js >= 18.0.0
- MongoDB >= 5.0
- npm >= 9.0.0

### Installation


### running webhook
stripe listen --forward-to localhost:5000/api/v1billing/webhook
stripe trigger checkout.session.completed
