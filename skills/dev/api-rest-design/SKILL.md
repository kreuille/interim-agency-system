# Skill — Design d'API REST

## Rôle
API designer. Conçoit des API versionnées, idempotentes, documentées, faciles à consommer par des tiers et par nos propres clients.

## Quand l'utiliser
Toute création ou modification d'endpoint HTTP exposé (web-admin, portail, API partenaires, MovePlanner).

## Concepts clés
- **Ressources** nommées au pluriel : `/workers`, `/missions`, `/timesheets`.
- **Verbes HTTP sémantiques** : GET lecture, POST création, PUT remplacement, PATCH modification partielle, DELETE suppression.
- **Codes HTTP justes** : 200 OK, 201 Created + Location, 204 No Content, 400 validation, 401 auth, 403 autorisation, 404 ressource, 409 conflit d'état, 422 règle métier, 429 rate limit, 5xx erreur serveur.
- **Versioning** dans l'URL : `/api/v1/…`. Pas de versioning par header (complique le debug).

## Règles dures
- **OpenAPI 3.1** maintenu comme source de vérité. Génération des types TS client par `openapi-typescript`.
- **Idempotency-Key** obligatoire sur POST/PUT mutant. Persisté ≥ 24h, rejoue la réponse.
- **Pagination** cursor-based obligatoire pour les listings > 100 items. Pas d'offset.
- **Filtres** en query string explicites : `?status=pending&agencyId=...`. Pas de filtre magique.
- **Erreurs** au format RFC 9457 (Problem Details) : `{ type, title, status, detail, instance, errors: [...] }`.
- **Dates** en ISO 8601 avec timezone. Préférer UTC en sortie ; l'UI convertit.

## Pratiques
- Un endpoint = un use case (pas de "god endpoint").
- Ne jamais exposer un ID interne Prisma. Utiliser des UUID v4 partout.
- Les montants en Rappen dans le JSON (`amountRappen: 12345`), jamais en CHF flottant.
- Les champs sensibles (IBAN, AVS) ne sont jamais renvoyés en clair dans les listings — uniquement dans le détail ressource accessible à un rôle autorisé.
- Rate limit documenté dans OpenAPI et dans la doc publique.
- Deprecation d'un endpoint : header `Deprecation: true` + `Sunset: <date>` + doc publique. 90 j de préavis mini.

## Exemple — OpenAPI minimal

```yaml
openapi: 3.1.0
info: { title: Agence API, version: 1.0.0 }
paths:
  /api/v1/workers:
    post:
      operationId: registerWorker
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/RegisterWorkerInput' }
      responses:
        '201':
          description: Created
          headers:
            Location: { schema: { type: string } }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/WorkerSummary' }
        '422':
          description: Règle métier violée
          content:
            application/problem+json:
              schema: { $ref: '#/components/schemas/Problem' }
components:
  parameters:
    IdempotencyKey:
      name: Idempotency-Key
      in: header
      required: true
      schema: { type: string, format: uuid }
  schemas:
    Problem:
      type: object
      required: [type, title, status]
      properties:
        type: { type: string, format: uri }
        title: { type: string }
        status: { type: integer }
        detail: { type: string }
        errors:
          type: array
          items: { type: object }
```

## Pièges courants
- Renvoyer des champs différents selon le contexte dans le même endpoint. Séparer les ressources (`/workers/{id}` vs `/workers/{id}/summary`).
- Mutation via GET (violé par paresse). Jamais.
- Ne pas documenter les 4xx possibles → consommateurs qui devinent.
- OpenAPI divergent du code. Toujours tester la validité du spec et que le code respecte le spec (dredd ou prism).

## Références
- `CLAUDE.md §4`
- https://www.rfc-editor.org/rfc/rfc9457.html (Problem Details)
- https://www.openapis.org/
