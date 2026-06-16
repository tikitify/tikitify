import { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: trends } = await supabase
    .from("trends")
    .select("id");

  const videoUrls =
    trends?.map((trend) => ({
      url: `https://www.tikitify.com/video/${trend.id}`,
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
    ...videoUrls,
  ];
}