import { MetadataRoute } from "next";
import { getCurrentTrends } from "../lib/trends";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const trends = await getCurrentTrends();

  const videoUrls =
    trends.map((trend) => ({
      url: `https://www.tikitify.com/video/${trend.apify_id}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })) || [];

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
    ...videoUrls,
  ];
}
