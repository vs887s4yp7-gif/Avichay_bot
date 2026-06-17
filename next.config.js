/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Don't bundle @vercel/kv — resolved at runtime on Vercel
  serverExternalPackages: ["@vercel/kv"],
}
module.exports = nextConfig
