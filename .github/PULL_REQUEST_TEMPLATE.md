## Prompt

- **ID** : {ex. A1.1}
- **Titre** : {titre court}
- **Sprint** : {A.N}

## Résumé

{1 à 3 phrases — ce que cette PR apporte et pourquoi}

## Definition of Done

- [ ] {critère 1}
- [ ] {critère 2}
- [ ] {critère 3}
- [ ] `pnpm typecheck` vert
- [ ] `pnpm lint` vert
- [ ] `pnpm test` vert
- [ ] Couverture ≥ seuil module
- [ ] PROGRESS.md mis à jour

## Fichiers clés créés / modifiés

- `path/one.ts`
- `path/two.test.ts`

## Tests ajoutés

- `{description scénario 1}`
- `{description scénario 2}`

## Décisions prises

- {décision → justification}

## Dettes ouvertes / TODO

- [ ] {description — ticket ou issue#}

## Impact conformité

- **LSE** : aucun / détail
- **CCT** : aucun / détail
- **LTr** : aucun / détail
- **nLPD** : aucun / détail
- **LSE — audit log** : écriture confirmée oui/non

## Impact sécurité

- Secrets : aucun changement / détail
- Auth/Authz : aucun changement / détail
- Surface d'attaque : inchangée / nouveaux endpoints listés

## Notes pour le reviewer

{points d'attention, parties sensibles, choix à discuter}

## Capture / démo (optionnel)

{screenshot, GIF, ou section "démo live en sprint review"}

---

**Checklist reviewer**

- [ ] DoD vérifiée
- [ ] Architecture respectée (hexagonale, pas d'import infra → domain)
- [ ] Types stricts, pas de `any`
- [ ] Tests couvrent chemin heureux + erreurs métier
- [ ] Logs pas de PII en clair
- [ ] Docs à jour si API publique touchée
