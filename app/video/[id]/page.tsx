import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import VideoClient from "./VideoClient";
import { getTikTokEmbedUrl } from "../../../lib/tiktok";

const SITE_URL = "https://www.tikitify.com";

type Trend = {
  id?: number;
  apify_id: string;
  title?: string | null;
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
  created_at?: string | null;
  updated_at?: string | null;
  uploaded_at?: string | null;
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

function getAbsoluteUrl(value: string | null | undefined) {
  if (!value) return `${SITE_URL}/og-image.png`;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `${SITE_URL}${value.startsWith("/") ? value : `/${value}`}`;
}

function cleanText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
}

function getVideoName(trend: Trend) {
  const title = cleanText(trend.title);
  if (title) return truncate(title, 90);

  const rank = trend.position ? `#${trend.position}` : "Viral";
  const market =
    trend.market === "spain"
      ? "Spain TikTok trend"
      : trend.market === "global"
        ? "global TikTok trend"
        : "TikTok trend";
  const author = trend.author_username ? ` by @${trend.author_username}` : "";

  return `${rank} ${market}${author}`;
}

function getVideoDescription(trend: Trend) {
  const name = getVideoName(trend);
  const views = trend.views ? `${formatNumber(trend.views)} views` : "";
  const hashtags = cleanText(trend.hashtags);
  const details = [views, hashtags].filter(Boolean).join(". ");

  return truncate(
    `${name}. Discover this viral TikTok video on Tikitify.${
      details ? ` ${details}.` : ""
    }`,
    155
  );
}

function getUploadDate(trend: Trend) {
  const value = trend.uploaded_at || trend.created_at || trend.updated_at;
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
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

  const possibleIds = Array.from(
    new Set(
      [
        id,
        trendsData?.market ? `${trendsData.market}_${id}` : null,
        `global_${id}`,
        `spain_${id}`,
      ].filter(Boolean) as string[]
    )
  );

  const { data: poolData, error: poolError } = await supabase
    .from("trend_pool")
    .select("*")
    .in("apify_id", possibleIds)
    .limit(1);

  if (poolError) {
    console.error(poolError);
  }

  const poolTrend = poolData?.[0] || null;

  if (!trendsData && !poolTrend) return null;

  return {
    ...(poolTrend || {}),
    ...(trendsData || {}),
    apify_id: trendsData?.apify_id || id.replace(/^(global|spain)_/, ""),
    title: poolTrend?.title || trendsData?.title || null,
    image_url: trendsData?.image_url || poolTrend?.image_url || null,
    video_url: trendsData?.video_url || poolTrend?.video_url || null,
    tiktok_url: trendsData?.tiktok_url || poolTrend?.tiktok_url || null,
    author_username:
      trendsData?.author_username || poolTrend?.author_username || null,
    views: trendsData?.views || poolTrend?.views || null,
    hashtags: trendsData?.hashtags || poolTrend?.hashtags || "",
  };
}

function getVideoJsonLd(trend: Trend, id: string) {
  const embedUrl = getTikTokEmbedUrl(trend.tiktok_url);
  const uploadDate = getUploadDate(trend);

  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: getVideoName(trend),
    description: getVideoDescription(trend),
    thumbnailUrl: [getAbsoluteUrl(trend.image_url)],
    url: `${SITE_URL}/video/${id}`,
    ...(embedUrl ? { embedUrl } : {}),
    ...(uploadDate ? { uploadDate } : {}),
    ...(trend.author_username
      ? {
          creator: {
            "@type": "Person",
            name: `@${trend.author_username}`,
          },
        }
      : {}),
    ...(trend.views
      ? {
          interactionStatistic: {
            "@type": "InteractionCounter",
            interactionType: {
              "@type": "WatchAction",
            },
            userInteractionCount: trend.views,
          },
        }
      : {}),
  };
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
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const videoName = getVideoName(trend);
  const title = `${videoName} | Tikitify`;
  const description = getVideoDescription(trend);
  const url = `${SITE_URL}/video/${id}`;
  const image = getAbsoluteUrl(trend.image_url);

  return {
    title,
    description,
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
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
          alt: videoName,
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

  return (
    <>
      {trend && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(getVideoJsonLd(trend, id)).replace(
              /</g,
              "\\u003c"
            ),
          }}
        />
      )}
      <VideoClient trend={trend} />
    </>
  );
}
