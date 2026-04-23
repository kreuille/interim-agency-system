import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /**
   * Standalone output pour Cloud Run (Phase 2 preview) : produit un serveur
   * Node.js autonome dans `.next/standalone/`. `outputFileTracingRoot`
   * pointé sur la racine monorepo pour inclure les workspace packages.
   */
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  /**
   * Résolution des imports TypeScript en `.js` (convention NodeNext monorepo).
   * Sans ça, `import x from './lib/session.js'` échoue à trouver `./lib/session.ts`.
   */
  webpack: (config, { isServer, webpack }) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    if (!isServer) {
      // Strip `node:` scheme puis fallback Node-only modules à false côté client.
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
