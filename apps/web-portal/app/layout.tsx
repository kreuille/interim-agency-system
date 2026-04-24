import type { ReactNode } from 'react';
// Fonts self-hostées (Inter) — nLPD-safe, pas de Google Fonts direct.
import '@interim/branding/fonts.css';
// Tokens design system Helvètia Intérim (couleurs, rayons, ombres).
import '@interim/branding/tokens.css';
import { ServiceWorkerRegister } from './_components/ServiceWorkerRegister.js';
import './globals.css';

export const metadata = {
  title: 'Helvètia Intérim — Portail intérimaire',
  description:
    'Déclarez vos disponibilités, consultez vos missions, signez vos contrats — où que vous soyez.',
  manifest: '/manifest.webmanifest',
  themeColor: '#c8102e',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr-CH">
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icon-192.svg" type="image/svg+xml" />
      </head>
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
