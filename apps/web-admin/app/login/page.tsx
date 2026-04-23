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
  const [email, setEmail] = useState('marie.bovay@helvetia-interim.ch');
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
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--bg)',
      }}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 420, padding: 28 }}
        aria-label="Connexion"
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              background: 'var(--accent)',
              position: 'relative',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
            }}
            aria-hidden="true"
          >
            <span
              style={{
                position: 'absolute',
                left: 6,
                top: 12.5,
                width: 16,
                height: 3,
                background: 'white',
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 12.5,
                top: 6,
                width: 3,
                height: 16,
                background: 'white',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>
              Helvètia Intérim
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--ink-4)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Back-office · Lausanne
            </div>
          </div>
        </div>

        <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Connexion (dev)</h1>
        <p style={{ marginTop: 6, color: 'var(--ink-3)', fontSize: 12 }}>
          Authentification réelle Firebase (DETTE-014) à venir. En attendant, posez une session
          locale pour tester l&apos;UI.
        </p>

        <form
          onSubmit={onSubmit}
          style={{ marginTop: 20 }}
          aria-label="Formulaire de connexion"
          noValidate
        >
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
            <p className="error" role="alert" style={{ color: 'var(--accent)', fontSize: 11.5 }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn accent"
            style={{ marginTop: 8, width: '100%', justifyContent: 'center', padding: '8px 12px' }}
          >
            Se connecter
          </button>
        </form>
      </div>
    </main>
  );
}
