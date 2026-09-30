import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // The public landing page is copied into Cloudflare's static asset bundle.
  // A matching asset is served before the Worker, avoiding an SSR invocation.
  publicDir: "cloudflare-public",
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
