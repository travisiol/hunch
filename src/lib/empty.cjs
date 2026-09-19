// Stand-in for optional `@x402/*` payment packages that @base-org/account
// (pulled in transitively by wagmi's connectors) reaches for. CommonJS on
// purpose: Turbopack cannot statically check its exports, so the named
// imports resolve to undefined instead of failing the build. Never called.
module.exports = new Proxy({}, { get: () => undefined });
