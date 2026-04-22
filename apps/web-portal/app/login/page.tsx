import Link from 'next/link';
import { LoginForm } from './LoginForm.js';

interface PageProps {
  readonly searchParams: { sent?: string; error?: string };
}

export default function LoginPage({ searchParams }: PageProps) {
  return (
    <main>
      <h1>Connexion intérimaire</h1>
      <p>
        Recevez un lien magique sur votre adresse e-mail pour accéder à votre planning. En attendant
        la mise en service du provider Firebase (DETTE-024), un mode développeur valide directement
        la session.
      </p>

      {searchParams.sent ? (
        <div className="banner banner-info" role="status">
          Lien envoyé à {searchParams.sent}. Cliquez sur le bouton ci-dessous pour valider la
          session de développement.
        </div>
      ) : null}

      {searchParams.error ? (
        <div className="banner banner-warn" role="alert">
          {searchParams.error}
        </div>
      ) : null}

      <LoginForm presetEmail={searchParams.sent} />

      <p style={{ marginTop: 24, fontSize: '0.875rem', color: '#666' }}>
        Pas encore inscrit ? Contactez votre agence — <Link href="/">retour à l'accueil</Link>.
      </p>
    </main>
  );
}
