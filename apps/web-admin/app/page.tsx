import Link from 'next/link';

export default function HomePage() {
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
      <div className="card" style={{ maxWidth: 480, padding: 28, textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 16,
          }}
        >
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
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>
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
              Back-office · Lausanne · VD
            </div>
          </div>
        </div>
        <p style={{ color: 'var(--ink-3)', fontSize: 12.5, marginBottom: 16 }}>
          MVP en construction. Voir <code>docs/03-plan-de-dev.md</code>.
        </p>
        <Link
          href="/login"
          className="btn accent"
          style={{ display: 'inline-flex', justifyContent: 'center', padding: '8px 14px' }}
        >
          Accéder au back-office
        </Link>
      </div>
    </main>
  );
}
