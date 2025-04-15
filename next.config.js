/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Apply these headers to all routes
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src *; img-src 'self' data: blob:; font-src 'self' data:; frame-src 'self' https://*.walletconnect.com https://*.walletconnect.org;"
          }
        ],
      },
    ]
  },
}

module.exports = nextConfig
