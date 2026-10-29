import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep builds light on shared machines.
  experimental: { cpus: 3 },
  // The Qloo harness and MCP SDK spawn child processes; keep them out of the bundle.
  serverExternalPackages: ["@qloo/qloo-harness", "@modelcontextprotocol/sdk", "bcryptjs"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
