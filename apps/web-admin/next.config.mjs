/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
      };
    }
    return config;
  },
};

export default nextConfig;
