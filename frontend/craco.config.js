// craco.config.js
const path = require("path");
require("dotenv").config();

// Environment variable overrides
const config = {
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
};

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

let webpackConfig = {
  // ESLint config only applied when the ESLint plugin is enabled. When the
  // preview launcher sets DISABLE_ESLINT_PLUGIN=true, react-scripts does not
  // add the plugin at all, so craco would warn "Cannot find ESLint plugin".
  ...(process.env.DISABLE_ESLINT_PLUGIN === "true"
    ? {}
    : {
        eslint: {
          configure: {
            extends: ["plugin:react-hooks/recommended"],
            rules: {
              "react-hooks/rules-of-hooks": "error",
              "react-hooks/exhaustive-deps": "warn",
            },
          },
        },
      }),
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {

      // ── Deployment resilience: persistent filesystem cache ──────────────
      // The preview pod restarts services aggressively, which can interrupt a
      // production build. A filesystem cache lets each build attempt RESUME
      // from previously-compiled modules instead of starting from scratch, so
      // repeated attempts converge to a finished bundle quickly.
      webpackConfig.cache = {
        type: 'filesystem',
        cacheDirectory: require('path').resolve(__dirname, 'node_modules/.cache/webpack-build'),
        buildDependencies: { config: [__filename] },
        maxMemoryGenerations: 1,
      };

      // Dev: 'false' devtool = no source maps at all. Even cheaper on RAM than
      // 'eval' AND compatible with strict CSP (no 'unsafe-eval' needed). The
      // Emergent preview ingress enforces a CSP that blocks eval-based scripts,
      // so we cannot use 'eval'/'eval-source-map' here.
      if (process.env.NODE_ENV !== 'production') {
        webpackConfig.devtool = false;
        webpackConfig.parallelism = 2;
      }

      // Deployment: skip Terser minification (slowest/most memory-hungry
      // phase) so the build finishes on a 2GB pod. Served gzip by `serve`.
      webpackConfig.optimization = webpackConfig.optimization || {};
      webpackConfig.optimization.minimize = false;

      // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
        ],
      };

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }
      return webpackConfig;
    },
  },
};

webpackConfig.devServer = (devServerConfig) => {
  // webpack-dev-server v4.15+ schema no longer accepts a top-level `https`
  // property (moved into `server: { type: 'https' }`). react-scripts still
  // injects `https: false`, which fails schema validation and crashes the
  // dev server. Strip it here (we serve plain HTTP inside the pod; TLS is
  // terminated by the Emergent preview ingress).
  if ('https' in devServerConfig) {
    delete devServerConfig.https;
  }

  // Allow all hosts (needed for preview / proxied dev URLs)
  devServerConfig.allowedHosts = 'all';
  
  // Add proxy to backend for API calls
  devServerConfig.proxy = [
    {
      context: ['/api'],
      target: 'http://localhost:8001',
      changeOrigin: true,
      secure: false,
      ws: true,
    },
  ];

  // ── PHASE SECURITY S3.3 — security headers on SPA (non-/api) responses ──
  // /api responses already carry these from the backend middleware, so we
  // ONLY annotate the documents/assets served by the dev server here (avoids
  // duplicate headers on proxied API calls). CSP ships Report-Only so it
  // cannot break the app — violations POST to /api/security/csp-report.
  const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), payment=()',
  };
  const CSP_REPORT_ONLY = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' https://js.stripe.com https://accounts.google.com https://apis.google.com https://www.googletagmanager.com",
    "connect-src 'self' https://api.stripe.com https://*.stripe.com https://accounts.google.com https://www.google-analytics.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://accounts.google.com",
    "worker-src 'self' blob:",
    "form-action 'self'",
    "report-uri /api/security/csp-report",
  ].join('; ');

  // webpack-dev-server v4 forbids using `setupMiddlewares` together with the
  // deprecated `onBeforeSetupMiddleware` / `onAfterSetupMiddleware` that
  // react-scripts injects. Capture their logic, migrate it into
  // `setupMiddlewares`, then remove the deprecated keys to satisfy the schema.
  const _priorSetup = devServerConfig.setupMiddlewares;
  const _onBefore = devServerConfig.onBeforeSetupMiddleware;
  const _onAfter = devServerConfig.onAfterSetupMiddleware;
  delete devServerConfig.onBeforeSetupMiddleware;
  delete devServerConfig.onAfterSetupMiddleware;

  devServerConfig.setupMiddlewares = (middlewares, devServer) => {
    // react-scripts "before" middlewares (eval source maps, proxy setup)
    if (typeof _onBefore === 'function') {
      _onBefore(devServer);
    }

    middlewares.unshift({
      name: 'security-headers',
      middleware: (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api')) {
          Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
          res.setHeader('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY);
        }
        next();
      },
    });

    if (typeof _priorSetup === 'function') {
      middlewares = _priorSetup(middlewares, devServer) || middlewares;
    }

    // react-scripts "after" middlewares (redirect served path, noop SW)
    if (typeof _onAfter === 'function') {
      _onAfter(devServer);
    }
    return middlewares;
  };

  // Add health check endpoints if enabled
  if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Call original setup if exists
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }

      // Setup health endpoints
      setupHealthEndpoints(devServer, healthPluginInstance);

      return middlewares;
    };
  }

  return devServerConfig;
};

module.exports = webpackConfig;
