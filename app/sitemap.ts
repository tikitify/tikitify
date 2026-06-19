import { MetadataRoute } from "next";
import { getHashtagSlug } from "../lib/hashtags";
import { getCurrentTrends, getSitemapHashtags } from "../lib/trends";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [trends, hashtags] = await Promise.all([
    getCurrentTrends(),
    getSitemapHashtags(),
  ]);

  const videoUrls =
    trends.map((trend) => ({
      url: `https://www.tikitify.com/video/${trend.apify_id}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })) || [];

  const hashtagUrls = hashtags.map((tag) => ({
    url: `https://www.tikitify.com/hashtag/${getHashtagSlug(tag)}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  return [
    {
      url: "https://www.tikitify.com",
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: "https://www.tikitify.com/espana",
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: "https://www.tikitify.com/trending-global",
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    ...hashtagUrls,
    ...videoUrls,
  ];
}
