'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface LoginFormProps {
  readonly presetEmail?: string;
}

export function LoginForm({ presetEmail }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState(presetEmail ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/request-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setError('Adresse e-mail invalide ou inconnue.');
        setPending(false);
        return;
      }
      router.push(`/login?sent=${encodeURIComponent(email)}`);
    } catch {
      setError('Erreur réseau. Réessayez.');
    } finally {
      setPending(false);
    }
  }

  async function verifyDev() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setError('Validation impossible (mode dev).');
        setPending(false);
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Erreur réseau. Réessayez.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        void requestLink(e);
      }}
    >
      <div className="field">
        <label htmlFor="email">Adresse e-mail</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          required
          autoComplete="email"
          inputMode="email"
        />
        {error ? <span className="error">{error}</span> : null}
      </div>
      <button type="submit" className="btn-primary" disabled={pending || !email}>
        {pending ? 'Envoi…' : 'Recevoir le lien'}
      </button>
      {presetEmail ? (
        <button
          type="button"
          className="btn-primary"
          style={{ marginTop: 8, background: '#1b5e20' }}
          onClick={() => {
            void verifyDev();
          }}
          disabled={pending}
        >
          Activer la session (mode dev)
        </button>
      ) : null}
    </form>
  );
}
