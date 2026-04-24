# Email type — Demande d'accès sandbox MovePlanner

> **Objectif** : obtenir l'accès sandbox API + webhooks MovePlanner pour valider l'intégration en conditions réelles.
> **Débloque** : BLOCKER-001.
> **Délai attendu** : 3 à 10 jours ouvrés pour la réponse, puis provisioning côté MP.
> **Responsable** : fondateur.

---

## 1. Avant d'envoyer

Vérifier qu'on a :
- [ ] Un **contact technique** côté MovePlanner (référent partenaire) — à demander au contact commercial si pas évident.
- [ ] Un **certificat mTLS de test** généré localement (ou être prêt à en générer un à la demande).
- [ ] Un **endpoint HTTPS public** pour recevoir les webhooks de test. Deux options :
  - Solution temporaire : tunnel via **ngrok** (`ngrok http 3000` → URL publique stable si plan payant) ou **Cloudflare Tunnel**.
  - Solution durable : déployer le back en staging GCP (dès A0.4 terminé).
- [ ] Un **email pro** de l'agence (pas gmail).

---

## 2. Générer un certificat mTLS client (si pas déjà fait)

Le contrat d'interface `docs/02-partners-specification.md §7.5` impose mTLS. Générer une paire clé/cert pour le test :

```bash
# Clé privée
openssl genpkey -algorithm RSA -out mtls-client.key -pkeyopt rsa_keygen_bits:4096

# CSR (Certificate Signing Request)
openssl req -new -key mtls-client.key -out mtls-client.csr \
  -subj "/C=CH/ST=Vaud/L=Lausanne/O=Agence Intérim SA/CN=interim-agency-staging"

# Cert auto-signé (MP fournira ensuite son propre cert signé par leur CA)
openssl x509 -req -in mtls-client.csr -signkey mtls-client.key -out mtls-client.crt -days 90

# Fingerprint SHA-256 (à communiquer à MP)
openssl x509 -in mtls-client.crt -noout -fingerprint -sha256
```

Conserver `mtls-client.key` en Secret Manager, jamais en clair.

---

## 3. Email à envoyer

**À** : `partenariats@moveplanner.ch` (ou contact technique direct)
**Cc** : ton contact commercial MP
**Objet** : Demande d'accès sandbox API — Agence Intérim SA (partenariat intérim)

```
Bonjour,

Je vous contacte en qualité de fondateur de l'Agence Intérim SA,
agence de travail temporaire suisse basée à [Lausanne / Genève / ville],
dans le cadre du partenariat intérim que nous finalisons avec MovePlanner.

Notre système d'information agence est développé et testé en local. Nous
sommes prêts à valider l'intégration API + webhooks en conditions réelles.
Je sollicite donc l'accès à votre environnement sandbox selon les modalités
décrites dans `partners-interim-specification.md §7`.

## Éléments techniques que nous proposons

- **partnerId souhaité** : à attribuer par vous (ex. ptn_interim_agency_001).
- **Certificat mTLS client** : nous avons généré une paire de test, empreinte
  SHA-256 du cert public : [XX:XX:XX:…:XX]. Nous pouvons également adopter
  la procédure inverse si vous préférez signer un CSR que nous vous fournirons.
- **Endpoint webhooks** : https://staging-api.monagence.ch/webhooks/moveplanner
  (actif dès notre infra staging GCP provisionnée — d'ici 1-2 semaines).
  En attendant, tunnel temporaire : https://[slug].ngrok.app/webhooks/moveplanner.
- **Secret HMAC-SHA256** pour vérification des webhooks : nous accepterons
  celui que vous générerez pour notre `partnerId`.

## Besoins sandbox côté MP

1. Création du `partnerId` côté MovePlanner avec statut "actif".
2. Émission du certificat mTLS serveur signé par votre CA (pour que nous
   vérifions l'identité MP sur nos appels sortants) + clé API Bearer initiale.
3. Injection du secret HMAC partagé pour les webhooks entrants.
4. Activation de l'émission de webhooks de test (`worker.assignment.proposed`,
   `timesheet.ready_for_signature`, etc.) vers notre endpoint dès que
   l'infrastructure le permet.
5. (optionnel) Un jeu de fixtures sandbox : 2-3 missions fictives, quelques
   timesheets prêts à être signés. Permet de dérouler un scénario end-to-end
   sans impacter vos données réelles.

## Rate limits et protection

Nous respectons les limites du contrat : 100 req/min et 1000 req/jour par
partnerId, idempotency keys sur POST/PUT, retry backoff exponentiel,
circuit breaker côté client.

## Calendrier

- **Cette semaine** : réception des credentials sandbox idéalement.
- **Semaine+1** : tests d'intégration E2E sur nos 10 endpoints et 12 types
  de webhooks.
- **Semaine+2** : retours éventuels sur des shapes ou des comportements qui
  divergeraient de la spec, avec PR sur le repo commun si nécessaire.
- **Semaine+3-4** : finalisation, bascule vers prod dès notre autorisation
  LSE cantonale reçue et pentest passé.

## Contacts

- Contact technique : [nom], [email], [+41 XX XXX XX XX]
- Contact commercial : [nom]
- Responsable sécurité : [nom]

N'hésitez pas à me transférer vers la personne technique dédiée à
l'intégration si un relais est plus efficace. Je suis disponible pour
un call de 30 minutes cette semaine pour aligner les détails.

Merci d'avance, et bonne journée.

Cordialement,

[Nom]
Fondateur, Agence Intérim SA
[Adresse]
[IDE : CHE-XXX.XXX.XXX]
```

---

## 4. Pendant l'attente de réponse

Continuer les tests avec le mock local (`apps/mock-moveplanner/`) — il reproduit fidèlement le contrat de la spec. Aucun développement n'est bloqué ; seul le go-live prod dépend de la sandbox.

---

## 5. À réception des credentials sandbox

1. Pousser les secrets dans Secret Manager staging (clé API, HMAC, cert mTLS serveur MP).
2. Lancer une session Claude Code ciblée : valider les 10 endpoints en ordre, capturer les webhooks, comparer shapes réels vs mock.
3. Ouvrir ticket si divergence de spec constatée (avec exemple payload) — mais ne pas modifier notre code tant que MP n'a pas confirmé si c'est un bug MP ou un changement de spec.
4. Mettre à jour `PROGRESS.md` : BLOCKER-001 → résolu.

---

## 6. Escalades possibles

Si pas de réponse sous 10 jours ouvrés :
- Relance email simple.
- Appel au contact commercial.
- En dernier recours : escalade direction MP.

Si MP tarde > 3 semaines, activer **mitigation BLOCKER-001** : démarrer le pilote intérieur avec le mock MP et un client test (un ami qui a une PME BTP) pour ne pas bloquer l'itération produit.

---

**Fin du document v1.0 — 2026-04-23**
