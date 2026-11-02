/** @type {import('next').NextConfig} */
module.exports = {
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Native / optional packages must not be bundled by webpack.
    serverComponentsExternalPackages: ['sharp', '@imgly/background-removal-node', 'nodemailer'],
  },
};
