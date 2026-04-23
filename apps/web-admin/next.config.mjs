import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /**
   * Standalone output pour Cloud Run (Phase 2 preview) : produit un serveur
   * Node.js autonome dans `.next/standalone/` avec ses deps minimales.
   * `outputFileTracingRoot` pointé sur la racine monorepo pour que Next
   * traque aussi les deps des workspace packages (`@interim/domain`, etc.).
   */
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  /**
   * Permet à webpack de résoudre les imports TypeScript écrits avec extension
   * `.js` (convention NodeNext utilisée dans tout le monorepo). Sans ça, le
   * serveur dev échoue avec "Module not found: Can't resolve '../../lib/auth.js'".
   *
   * Aussi : neutralise les imports `node:crypto` qui remontent transitivement
   * depuis `@interim/domain` quand un client component importe juste un type
   * (`Role`) ou une constante (`ROLES`) — node:crypto n'est jamais utilisé
   * runtime côté client mais webpack 5 refuse le scheme `node:` non géré.
   */
  webpack: (config, { isServer, webpack }) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    if (!isServer) {
      // Strip `node:` scheme puis fallback les modules node-only à false.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, '');
        }),
      );
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        crypto: false,
        fs: false,
        path: false,
        os: false,
        stream: false,
        buffer: false,
        // prom-client (transit via `@interim/shared/observability/prom-registry`)
        // pull cluster + v8 + net + tls qui sont Node-only. On les neutralise
        // pour le bundle client — jamais exécutés côté navigateur.
        cluster: false,
        v8: false,
        net: false,
        tls: false,
        child_process: false,
        http: false,
        https: false,
        zlib: false,
        perf_hooks: false,
        async_hooks: false,
        worker_threads: false,
        dns: false,
      };
    }
    return config;
  },
};

export default nextConfig;
