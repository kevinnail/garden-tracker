const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

// better-auth (and @better-auth/core) ship their subpaths via the package
// "exports" map (e.g. @better-auth/core/utils/string). Metro doesn't resolve
// those subpaths unless package-exports resolution is enabled.
config.resolver.unstable_enablePackageExports = true;

config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    middleware(req, res, next);
  };
};

module.exports = config;
