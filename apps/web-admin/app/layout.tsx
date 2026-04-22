import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Agence Intérim — Back-office',
  description: "Back-office agence d'intérim suisse",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr-CH">
      <body>{children}</body>
    </html>
  );
}
