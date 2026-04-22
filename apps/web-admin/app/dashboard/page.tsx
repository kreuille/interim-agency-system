export default function DashboardHome() {
  return (
    <>
      <div className="card">
        <h1>Tableau de bord</h1>
        <p style={{ marginTop: 12 }}>
          Bienvenue. Utilisez la navigation pour accéder aux intérimaires, clients et documents.
        </p>
      </div>
      <div className="card">
        <h2>Statut du sprint</h2>
        <ul style={{ marginTop: 12, paddingLeft: 24 }}>
          <li>A1.1 — Intérimaires CRUD ✓</li>
          <li>A1.2 — Documents upload ✓</li>
          <li>A1.3 — Alertes d'expiration ✓</li>
          <li>A1.4 — Clients CRUD ✓</li>
          <li>A1.5 — Contrats + tarifs CCT ✓</li>
          <li>A1.6 — Audit log domain ✓</li>
          <li>A1.7 — Cette interface (en cours)</li>
        </ul>
      </div>
    </>
  );
}
