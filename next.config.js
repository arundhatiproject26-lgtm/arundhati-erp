import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Server runs in IST regardless of platform default, so "today" in attendance
// and leave date math doesn't roll over between 00:00 and 05:30 IST.
process.env.TZ = 'Asia/Kolkata'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: { root: __dirname },
}

export default nextConfig
