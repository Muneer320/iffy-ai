import type { NextConfig } from 'next';
const nextConfig:NextConfig={poweredByHeader:false,output:'standalone',async rewrites(){return [{source:'/api/:path*',destination:`${process.env.IFFY_BACKEND_URL??'http://127.0.0.1:8102'}/api/:path*`}];}};
export default nextConfig;
