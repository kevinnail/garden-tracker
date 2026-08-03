// Dynamic config: when APP_VARIANT=development (set by the EAS `development`
// build profile), override the identifiers so the dev build installs as a
// SEPARATE app — its own icon and its own data sandbox — alongside the
// App Store build. This protects existing local data: a same-bundle-id dev
// build would force deleting the production app and wipe its SQLite.
//
// The static config in app.json is passed in as `config`; we spread it and
// only change what the dev variant needs.
const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => {
  if (!IS_DEV) return config;

  return {
    ...config,
    name: 'Crop Planner (Dev)',
    ios: {
      ...config.ios,
      bundleIdentifier: `${config.ios.bundleIdentifier}.dev`,
      infoPlist: {
        ...config.ios.infoPlist,
        // Dev-only ATS exception: allow plain-HTTP to Metro and the local
        // backend over the Tailscale/LAN IP. iOS blocks cleartext to non-local
        // hosts and the 100.x Tailscale range isn't treated as local. This is
        // ONLY in the dev variant — the production App Store build keeps ATS
        // fully enforced (this branch never runs without APP_VARIANT=development).
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
        },
      },
    },
    android: {
      ...config.android,
      package: `${config.android.package}.dev`,
    },
  };
};
