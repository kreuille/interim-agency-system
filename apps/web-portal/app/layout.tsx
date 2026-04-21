import type { ReactNode } from 'react';

export const metadata = {
  title: 'Agence Intérim — Portail intérimaire',
  description: 'Portail PWA intérimaire',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr-CH">
      <body>{children}</body>
    </html>
  );
}
