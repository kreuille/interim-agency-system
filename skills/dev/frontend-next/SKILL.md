# Skill — Frontend Next.js

## Rôle
Dev frontend senior. Livre des interfaces accessibles, performantes, typées de bout en bout, qui respectent la charte et l'ergonomie du fondateur.

## Quand l'utiliser
Tout prompt qui touche `apps/web-admin/` ou `apps/web-portal/`. Composants, pages, formulaires, dashboards.

## Concepts clés
- **Next.js 14 App Router** par défaut. Server Components quand possible, Client Components uniquement quand nécessaire (état, event handlers, browser API).
- **Tailwind CSS** + **shadcn/ui** pour la base. Pas de CSS custom sans justification.
- **React Hook Form + Zod** pour les formulaires (même schéma que l'API → cohérence).
- **TanStack Query** pour les fetch côté client ; Server Actions ou fetch serveur pour le SSR.
- **Accessibilité** WCAG 2.1 AA minimum.

## Règles dures
- Typage de bout en bout : les types des réponses API sont générés par `openapi-typescript` depuis l'OpenAPI interne, pas recopiés à la main.
- Pas de `any`, pas de `@ts-ignore`.
- Tous les formulaires ont : labels associés, messages d'erreur accessibles (`aria-describedby`), gestion de la touche Entrée, focus visible, état de soumission.
- Les dates sont formatées avec `date-fns` en `fr-CH` (séparateur `.`, format `dd.MM.yyyy`).
- Les montants sont formatés via `Intl.NumberFormat('fr-CH', { style: 'currency', currency: 'CHF' })` — jamais en string concaténée.
- Les CTA sont explicites : « Enregistrer les modifications » plutôt que « OK ».

## Pratiques
- Composants dans `components/` si réutilisables, sinon colocalisés dans `app/.../_components/`.
- Un Server Component fetch les données, passe à un Client Component interactif.
- Loading UI via `loading.tsx` ; error boundaries via `error.tsx` par segment.
- Server Actions pour les mutations simples ; API route `/api/...` pour les mutations complexes ou multi-étapes.
- Internationalisation prête dès le départ (next-intl) : toutes les chaînes extraites, même si FR uniquement au lancement.
- Tests : Vitest + Testing Library pour les composants, Playwright pour les flows E2E critiques.

## Pattern — formulaire RHF + Zod

```tsx
'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { RegisterWorkerInput } from '@app-contracts/workers'
import { Button, Input, Label, FieldError } from '@/components/ui'

export function RegisterWorkerForm() {
  const form = useForm({
    resolver: zodResolver(RegisterWorkerInput),
    mode: 'onBlur',
  })
  const onSubmit = form.handleSubmit(async (values) => {
    const res = await fetch('/api/workers', { method: 'POST', body: JSON.stringify(values) })
    // handle res...
  })
  return (
    <form onSubmit={onSubmit} noValidate>
      <Label htmlFor="firstName">Prénom</Label>
      <Input id="firstName" aria-describedby="firstName-err" {...form.register('firstName')} />
      <FieldError id="firstName-err" error={form.formState.errors.firstName} />
      {/* ...autres champs */}
      <Button type="submit" disabled={form.formState.isSubmitting}>
        Enregistrer
      </Button>
    </form>
  )
}
```

## Pièges courants
- Fetch dans un Server Component qui reçoit du JWT utilisateur : attention à la propagation du cookie. Passer par un wrapper `serverFetch` qui ajoute les headers depuis `cookies()`.
- Hydration mismatch : dates rendues différemment côté serveur et client. Toujours utiliser `Intl.DateTimeFormat` avec un timezone explicite.
- Formulaires non protégés contre double-submit. Toujours bloquer via `disabled={isSubmitting}`.
- Appels directs à Prisma dans un Server Component (confusion API/UI). Toujours passer par une couche `lib/api/` ou Server Action.

## Références
- `CLAUDE.md §2.4`, `docs/05-architecture.md §3`
- https://nextjs.org/docs
- https://ui.shadcn.com
- WCAG quick ref : https://www.w3.org/WAI/WCAG21/quickref/
