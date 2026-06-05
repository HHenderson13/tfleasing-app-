import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ["basic-ftp", "ssh2", "ssh2-sftp-client"],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    // Aggressively tree-shake these libs in client bundles. drizzle-orm
    // and zod each ship a lot of barrel exports we don't use; without
    // this flag every chunk that imports them drags in the whole API.
    optimizePackageImports: ["drizzle-orm", "zod", "@vercel/blob", "date-fns"],
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

export default nextConfig;
