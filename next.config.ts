import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

// Toggle with `ANALYZE=true npm run build` — produces HTML reports under
// .next/analyze/ showing which deps end up in each client chunk. Lets us
// catch accidental client-bundle bloat (a server-only dep slipping into a
// client component, a barrel import dragging the whole lib in, etc.).
const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: {
    // Pin the workspace root to this project.
    //
    // Without it Next walks up looking for a lockfile, finds
    // ~/package-lock.json, and treats the home directory as the root — so
    // every chunk name is built from a path containing the curly
    // apostrophe in "Harry’s MacBook Pro". Turbopack slices those names at
    // a byte offset and panics when the cut lands inside the multi-byte
    // character:
    //
    //   start byte index 25 is not a char boundary; it is inside '’'
    //
    // which kills `next build` outright. Rooting here makes chunk names
    // relative to the project ("src/app/…"), which is plain ASCII. It also
    // silences the "multiple lockfiles detected" warning and stops
    // Turbopack watching the whole home directory.
    root: __dirname,
  },
  serverExternalPackages: ["basic-ftp", "ssh2", "ssh2-sftp-client"],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    // Aggressively tree-shake these libs in client bundles. drizzle-orm
    // and zod each ship a lot of barrel exports we don't use; without
    // this flag every chunk that imports them drags in the whole API.
    // (date-fns dropped — not in this project's deps.)
    optimizePackageImports: ["drizzle-orm", "zod", "@vercel/blob"],
  },
  // Allow Next/Image to optimise our Vercel Blob-hosted headshots — without
  // this, src must be local. Wildcard covers all tenant blob hostnames
  // (randomised per project).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },
};

export default bundleAnalyzer(nextConfig);
