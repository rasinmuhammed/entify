import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle containing only the node_modules
  // actually reached at runtime. The Docker image ships that rather than the
  // full dependency tree, which is the difference between a few hundred
  // megabytes and well over a gigabyte.
  output: "standalone",
};

export default nextConfig;
