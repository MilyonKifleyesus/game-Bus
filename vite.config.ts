// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig as defineLovableConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
const config = defineLovableConfig({
  cloudflare: process.env.VERCEL ? false : undefined,
  plugins: process.env.VERCEL ? [nitro()] : [],
  tanstackStart: {
    server: { entry: "server" },
  },
});

export default async function viteConfig(env) {
  const resolvedConfig = await config(env);
  const plugins = Array.isArray(resolvedConfig.plugins)
    ? resolvedConfig.plugins.filter((plugin) => plugin && plugin.name !== "lovable-plugin")
    : resolvedConfig.plugins;

  return {
    ...resolvedConfig,
    plugins,
  };
}
