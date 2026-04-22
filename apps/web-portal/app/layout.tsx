import type { ReactNode } from 'react';
import { ServiceWorkerRegister } from './_components/ServiceWorkerRegister.js';
import './globals.css';

export const metadata = {
  title: 'Agence Intérim — Portail intérimaire',
  description: 'Déclarez vos disponibilités et consultez vos missions.',
  manifest: '/manifest.webmanifest',
  themeColor: '#0a4ea2',
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
