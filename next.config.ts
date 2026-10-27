import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [{source:'/auth/:path*',headers:[
      {key:'Referrer-Policy',value:'no-referrer'},
      {key:'Cache-Control',value:'private, no-store, max-age=0'},
      {key:'X-Robots-Tag',value:'noindex, nofollow'},
    ]}];
  },
};

export default nextConfig;
