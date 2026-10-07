# ENASHPRODD

Boutique de beats prête à personnaliser.

## 1. Installation

Installe Node.js 18+ puis, dans ce dossier :

```bash
npm install
cp .env.example .env
npm start
```

Ouvre http://localhost:3000

## 2. Identifiants admin

Dans `.env` :
- ADMIN_USER=admin
- ADMIN_PASSWORD=ton-mot-de-passe

Puis ouvre `/admin`.

## 3. Ajouter une prod

Le formulaire permet d'envoyer :
- une preview audio (celle publiée sur le site)
- le MP3 vendu
- le WAV vendu
- les stems en ZIP
- BPM, tonalité, genre, tags et prix

La page devient automatiquement :
`/prod/nom-de-la-prod`

Tu peux donc copier cette URL dans la description YouTube.

## 4. Paiement réel

Sans clé Stripe, le site fonctionne en MODE DÉMO.
Pour encaisser réellement :
1. crée un compte Stripe
2. renseigne STRIPE_SECRET_KEY dans `.env`
3. mets BASE_URL sur ton vrai domaine
4. ajoute un webhook Stripe pour confirmer les paiements avant d'autoriser les téléchargements

Le endpoint `/api/checkout` crée déjà les Checkout Sessions Stripe.

## 5. Mise en ligne

Le projet peut être déployé sur Render, Railway, Fly.io, VPS ou autre hébergeur Node.js.
Le dossier `uploads` et `data/beats.json` doivent être persistants sur l'hébergement choisi.

## 6. Domaine

Achète par exemple `enashprodd.com` puis pointe le DNS vers ton hébergeur.
Les URLs YouTube seront de la forme :

https://enashprodd.com/prod/nom-de-la-prod

## À améliorer avant production

- vrai webhook Stripe + autorisation des téléchargements par commande
- stockage fichiers objet (S3/R2/etc.)
- upload de covers directement depuis l'admin
- contrats/licences PDF automatiques
- emails de confirmation
- compte client / historique de commandes
- analytics
