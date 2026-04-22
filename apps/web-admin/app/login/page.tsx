'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ROLES, type Role } from '@interim/domain';
import { buildDevSessionCookie } from '../../lib/auth.js';

/**
 * Page de login dev : crée une session locale en posant un cookie.
 * En staging/prod : remplacer par le SDK Firebase Auth (DETTE-014).
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@agence.test');
  const [agencyId, setAgencyId] = useState('agency-pilote');
  const [role, setRole] = useState<Role>('agency_admin');
  const [error, setError] = useState<string | undefined>();

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!email.includes('@')) {
      setError('Email invalide');
      return;
    }
    const cookie = buildDevSessionCookie({
      userId: `user-${email}`,
      agencyId,
      role,
      displayName: email.split('@')[0] ?? 'User',
      email,
    });
    document.cookie = cookie;
    router.push('/dashboard');
  }

  return (
    <main className="main">
      <div className="card" style={{ maxWidth: 480 }}>
        <h1>Connexion (dev)</h1>
        <p style={{ marginTop: 8, color: '#666', fontSize: '0.875rem' }}>
          Authentification réelle Firebase (DETTE-014) à venir. En attendant, posez une session
          locale pour tester l'UI.
        </p>
        <form onSubmit={onSubmit} style={{ marginTop: 24 }} aria-label="Formulaire de connexion">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              required
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label htmlFor="agencyId">Agence (id)</label>
            <input
              id="agencyId"
              value={agencyId}
              onChange={(e) => {
                setAgencyId(e.target.value);
              }}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="role">Rôle</label>
            <select
              id="role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as Role);
              }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {error !== undefined && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary" style={{ marginTop: 16 }}>
            Se connecter
          </button>
        </form>
      </div>
    </main>
  );
}
