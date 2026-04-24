# DNS — `helvetia-interim.guedou.ch` (7 sous-domaines)

> **Destinataire** : fondateur (Arnaud) — à configurer chez le gestionnaire DNS actuel du domaine `guedou.ch` (probablement Infomaniak ou équivalent).
> **Décision** : ADR-0006 §3 — rester sur `guedou.ch` (pas d'acquisition TLD dédié pour l'instant).
> **Pas d'action automatisée ici** : Claude ne modifie pas ton DNS. Ce document liste les records à créer manuellement.
> **Prérequis** : que les services backend/frontend soient hébergés (Cloud Run preview actuelle OK, prod GCP à venir A0.4).

---

## 1. Zone racine parent

Ta zone `guedou.ch` existe déjà. On délègue tout ce qui commence par `helvetia-interim` en niveau 3. Pas besoin de sous-zone dédiée (géré comme des records simples sous `guedou.ch`).

## 2. Records à créer (7)

| Sous-domaine | Type | Valeur | TTL | Usage | Priorité |
|---|---|---|---|---|---|
| `helvetia-interim` | `CNAME` ou `A` | Landing (Cloudflare Pages / Vercel / GCS statique) — **valeur à obtenir du provider choisi en B0.2** | 3600 | Landing publique SaaS | Haute (marque) |
| `www.helvetia-interim` | `CNAME` | `helvetia-interim.guedou.ch.` (alias vers landing) | 3600 | Landing alias | Haute |
| `app.helvetia-interim` | `CNAME` | `ghs.googlehosted.com.` (ou IP A Cloud Run via LB — voir §3) | 300 | Back-office admin tenants (web-admin) | **Critique** (client-facing) |
| `api.helvetia-interim` | `CNAME` | idem Cloud Run | 300 | API publique tenants | **Critique** |
| `m.helvetia-interim` | `CNAME` | idem Cloud Run | 300 | Portail intérimaire PWA (web-portal) | **Critique** |
| `docs.helvetia-interim` | `CNAME` | Mintlify / GitBook — valeur provider (B4.2) | 3600 | Documentation publique | Moyenne |
| `status.helvetia-interim` | `CNAME` | Instatus / Statuspage — valeur provider (A6.7/B4) | 3600 | Statuspage pannes/maintenances | Moyenne |

### Note Cloud Run custom domain

Cloud Run accepte le mapping de custom domain via `gcloud run domain-mappings create`. Deux étapes :

1. Chez toi (DNS) : créer le CNAME `app.helvetia-interim.guedou.ch → ghs.googlehosted.com.` (valeur exacte retournée par `gcloud run domain-mappings describe ...`).
2. Chez GCP : `gcloud run domain-mappings create --service=<service> --domain=app.helvetia-interim.guedou.ch --region=europe-west1`.
3. GCP provisionne automatiquement un **certificat SSL managé Let's Encrypt** (délai 15-60 min après propagation DNS).

Limite : Cloud Run supporte wildcard custom domains **payant** (`*.helvetia-interim.guedou.ch` = $$$). Pour les espaces tenants white-label (B3.1), arbitrage à faire — voir §4.

## 3. Certificats SSL

Tous ces sous-domaines sont en **niveau 3** (`xxx.helvetia-interim.guedou.ch`). Let's Encrypt les supporte sans pb (limite 63 chars par label respectée, longest = `helvetia-interim` = 16 chars).

**Approche recommandée** :
- **Cloud Run managed certs** (gratuit, auto-renewal) pour `app`, `api`, `m`.
- **Cloudflare** (gratuit, plan Free suffit) pour `helvetia-interim`, `www`, `docs`, `status` — utilisé comme CDN + SSL edge.

**Pas d'approche recommandée** :
- Certbot manuel → auto-renewal fragile, fenêtre downtime en cas d'échec.
- Wildcard `*.helvetia-interim.guedou.ch` via DNS challenge → possible techniquement mais inutile pour ces 7 domaines fixes.

## 4. Arbitrage tenant spaces (white-label, B3.1)

Deux options pour les URL des tenants (ex. agence "ACME") :

**A. Sous-domaine niveau 4** : `app.acme.helvetia-interim.guedou.ch`
- Pro : URL "propre" par tenant, image professionnelle.
- Con : exige wildcard SSL niveau 4 → Cloud Run payant OU Cloudflare Advanced Certificate ($10/mois).
- Con : chaque nouveau tenant = provisioning DNS automatisé (delay 5-60 min Let's Encrypt).

**B. Routage par path** : `app.helvetia-interim.guedou.ch/t/acme`
- Pro : SSL gratuit sur le seul `app.`, zéro DNS par tenant.
- Pro : onboarding instantané (pas d'attente propagation).
- Con : URL moins "propre", moins prestigieuse.
- Con : middleware Next.js à configurer pour extraire `{tenantSlug}` du path.

**Décision à prendre en B3.1** après retours pilote. Recommandé : démarrer option B (path), migrer vers A si le besoin commercial le demande.

## 5. Email transactionnel + réputation

Pour les emails transactionnels du SaaS (signup confirmation, magic link, alertes tenant, factures Stripe) : configurer sur **`mail.helvetia-interim.guedou.ch`** indépendamment de ta messagerie perso `guedou.ch`.

- Records à créer :
  - `mail.helvetia-interim` `TXT` SPF : `v=spf1 include:_spf.postmarkapp.com ~all` (ou équivalent provider choisi en B1.4).
  - `selectorX._domainkey.mail.helvetia-interim` `TXT` DKIM : clé publique fournie par provider.
  - `_dmarc.mail.helvetia-interim` `TXT` DMARC : `v=DMARC1; p=quarantine; rua=mailto:dmarc@helvetia-interim.guedou.ch`.
- Isolation : ta réputation email perso (`guedou.ch`) ne doit PAS être impactée par le volume SaaS. D'où le sous-domaine dédié `mail.helvetia-interim`.

**Provider recommandé** : **Postmark EU** ou **Resend EU** (tous deux DPA CH-compatibles, hébergement UE). Voir B1.4.

## 6. Records supplémentaires recommandés (sécurité)

| Record | Type | Valeur | Usage |
|---|---|---|---|
| `helvetia-interim.guedou.ch` | `CAA` | `0 issue "letsencrypt.org"` | Empêche n'importe quelle CA d'émettre un cert pour ce domaine sauf Let's Encrypt |
| `helvetia-interim.guedou.ch` | `CAA` | `0 iodef "mailto:arnaud@guedou.ch"` | Notification en cas de tentative émission cert refusée |

## 7. Checklist de déploiement

- [ ] Créer les 7 records primaires (§2).
- [ ] Configurer Cloud Run domain mapping pour `app`, `api`, `m` (§2 note).
- [ ] Attendre propagation DNS (`dig @8.8.8.8 app.helvetia-interim.guedou.ch` doit résoudre).
- [ ] Vérifier SSL actif (`curl -I https://app.helvetia-interim.guedou.ch` → 200 avec cert Let's Encrypt).
- [ ] Configurer `mail.` SPF/DKIM/DMARC quand B1.4 sera fait.
- [ ] Ajouter CAA records (§6) après stabilisation.

## 8. Références

- [ADR-0006 §3](../adr/0006-saas-pivot.md) — décision domaine `helvetia-interim.guedou.ch` (pas TLD dédié).
- [Cloud Run custom domains](https://cloud.google.com/run/docs/mapping-custom-domains)
- [Let's Encrypt rate limits](https://letsencrypt.org/docs/rate-limits/) — 50 certs par domain de base par semaine, largement suffisant.
- `prompts/sprint-b-saas/B3.1` — arbitrage tenant spaces niveau 4 vs path.
- `prompts/sprint-b-saas/B1.4` — emails transactionnels + config SPF/DKIM/DMARC.
