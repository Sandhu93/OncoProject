import type { MetadataRoute } from 'next';

/** Served at /robots.txt. OncoTrack is an internal tool: no crawler should index anything. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
