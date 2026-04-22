'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { CANTONS } from '@interim/shared';

const schema = z.object({
  firstName: z.string().min(1, 'Prénom requis').max(80),
  lastName: z.string().min(1, 'Nom requis').max(80),
  avs: z.string().regex(/^756\.\d{4}\.\d{4}\.\d{2}$/, 'Format AVS invalide (756.XXXX.XXXX.XX)'),
  iban: z.string().regex(/^CH[\d ]+$/, 'IBAN suisse requis (commence par CH)'),
  residenceCanton: z.enum(CANTONS),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function NewWorkerPage() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { residenceCanton: 'GE' },
  });

  async function onSubmit(values: FormValues): Promise<void> {
    setSubmitError(undefined);
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
    try {
      const response = await fetch(`${apiBase}/api/v1/workers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer dev' },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setSubmitError(body.error ?? `Erreur API (${String(response.status)})`);
        return;
      }
      router.push('/dashboard/workers');
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur réseau');
    }
  }

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h1>Nouvel intérimaire</h1>
      <form
        onSubmit={(e) => {
          void handleSubmit(onSubmit)(e);
        }}
        noValidate
        style={{ marginTop: 24 }}
      >
        <div className="field">
          <label htmlFor="firstName">Prénom</label>
          <input id="firstName" {...register('firstName')} aria-invalid={!!errors.firstName} />
          {errors.firstName && (
            <span className="error" role="alert">
              {errors.firstName.message}
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor="lastName">Nom</label>
          <input id="lastName" {...register('lastName')} aria-invalid={!!errors.lastName} />
          {errors.lastName && (
            <span className="error" role="alert">
              {errors.lastName.message}
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor="avs">AVS</label>
          <input
            id="avs"
            placeholder="756.1234.5678.97"
            {...register('avs')}
            aria-invalid={!!errors.avs}
          />
          {errors.avs && (
            <span className="error" role="alert">
              {errors.avs.message}
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor="iban">IBAN</label>
          <input
            id="iban"
            placeholder="CH93 0076 2011 6238 5295 7"
            {...register('iban')}
            aria-invalid={!!errors.iban}
          />
          {errors.iban && (
            <span className="error" role="alert">
              {errors.iban.message}
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor="residenceCanton">Canton de résidence</label>
          <select id="residenceCanton" {...register('residenceCanton')}>
            {CANTONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="email">Email (optionnel)</label>
          <input id="email" type="email" {...register('email')} />
          {errors.email && (
            <span className="error" role="alert">
              {errors.email.message}
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor="phone">Téléphone (optionnel)</label>
          <input id="phone" placeholder="+41 78 000 00 00" {...register('phone')} />
        </div>
        {submitError !== undefined && (
          <p className="error" role="alert" style={{ marginBottom: 12 }}>
            {submitError}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Enregistrement...' : 'Créer'}
        </button>
      </form>
    </div>
  );
}
