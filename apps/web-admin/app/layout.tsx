import type { ReactNode } from 'react';
// Fonts self-hostées via @fontsource (nLPD : pas de Google Fonts en direct).
import '@interim/branding/fonts.css';
// Tokens design system (couleurs, rayons, ombres, shell).
import '@interim/branding/tokens.css';
import './globals.css';

export const metadata = {
  title: 'Helvètia Intérim — Back-office',
  description:
    "Helvètia Intérim — back-office d'agence de travail temporaire suisse, intégré MovePlanner.",
  themeColor: '#c8102e',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr-CH">
      <body>{children}</body>
    </html>
  );
}
