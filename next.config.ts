import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ["basic-ftp", "ssh2", "ssh2-sftp-client"],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
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
