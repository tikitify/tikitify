import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import VideoClient from "./VideoClient";

type Trend = {
  id?: number;
  apify_id: string;
  position?: number | null;
  market?: "global" | "spain";
  audio?: string | null;
  hashtags: string;
  image_url?: string | null;
  video_url?: string | null;
  views: number | null;
  likes?: number | null;
  shares?: number | null;
  comments?: number | null;
  tiktok_url: string | null;
  author_username: string | null;
};

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatNumber(value: number | null) {
  if (!value) return "-";
  if (value >= 1000000) return (value / 1000000).toFixed(1) + "M";
  if (value >= 1000) return (value / 1000).toFixed(1) + "K";
  return value.toString();
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function getTrend(id: string): Promise<Trend | null> {
  const supabase = getSupabase();

  const { data: trendsData, error: trendsError } = await supabase
    .from("trends")
    .select("*")
    .eq("apify_id", id)
    .maybeSingle();

  if (trendsError) {
    console.error(trendsError);
  }

  if (trendsData) return trendsData;

  const possibleIds = [id, `global_${id}`, `spain_${id}`];

  const { data: poolData, error: poolError } = await supabase
    .from("trend_pool")
    .select("*")
    .in("apify_id", possibleIds)
    .limit(1);

  if (poolError) {
    console.error(poolError);
  }

  return poolData?.[0] || null;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const trend = await getTrend(id);

  if (!trend) {
    return {
      title: "Video not found | Tikitify",
      description: "This Tikitify video could not be found.",
    };
  }

  const rank = trend.position ? `#${trend.position}` : "TikTok Trend";
  const author = trend.author_username ? ` by @${trend.author_username}` : "";
  const views = trend.views ? ` with ${formatNumber(trend.views)} views` : "";
  const title = `${rank} | Tikitify`;
  const description = `${rank}${author}${views}. TikTok Trends Today.`;
  const url = `https://www.tikitify.com/video/${id}`;
  const image = trend.image_url || "/og-image.png";

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "Tikitify",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function VideoPage({ params }: PageProps) {
  const { id } = await params;
  const trend = await getTrend(id);

  return <VideoClient trend={trend} />;
}