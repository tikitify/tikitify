import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function extractHashtags(title: string) {
  if (!title) return "";
  const matches = title.match(/#[\wáéíóúÁÉÍÓÚñÑüÜ]+/g);
  return matches ? matches.join(" ") : "";
}

function normalizeHashtags(item: any, title: string) {
  if (Array.isArray(item.hashtags) && item.hashtags.length > 0) {
    return item.hashtags
      .map((tag: string) => {
        const cleanTag = String(tag).replace("#", "").trim();
        return cleanTag ? `#${cleanTag}` : "";
      })
      .filter(Boolean)
      .join(" ");
  }

  return extractHashtags(title);
}

function getViews(item: any) {
  return item.views || item.playCount || item.play_count || item.stats?.playCount || 0;
}

function getLikes(item: any) {
  return item.likes || item.diggCount || item.digg_count || item.stats?.diggCount || 0;
}

function getShares(item: any) {
  return item.shares || item.shareCount || item.share_count || item.stats?.shareCount || 0;
}

function getComments(item: any) {
  return item.comments || item.commentCount || item.comment_count || item.stats?.commentCount || 0;
}

function getTikTokUrl(item: any) {
  return item.postPage || item.url || item.webVideoUrl || null;
}

function getUploadedAt(item: any) {
  return item.uploadedAtFormatted || item.uploadedAt || item.createTime || null;
}

function getAgeHours(uploadedAt: any) {
  if (!uploadedAt) return 9999;

  let date: Date;

  if (typeof uploadedAt === "number") {
    date = new Date(uploadedAt * 1000);
  } else {
    date = new Date(uploadedAt);
  }

  if (Number.isNaN(date.getTime())) return 9999;

  const diffMs = Date.now() - date.getTime();
  return Math.max(diffMs / (1000 * 60 * 60), 1);
}

function freshnessScore(item: any) {
  const views = getViews(item);
  const likes = getLikes(item);
  const comments = getComments(item);
  const shares = getShares(item);
  const uploadedAt = getUploadedAt(item);
  const ageHours = getAgeHours(uploadedAt);

  const engagementScore =
    views +
    likes * 2 +
    comments * 20 +
    shares * 50;

  const freshnessPenalty = Math.pow(ageHours + 12, 0.9);

  return Math.round(engagementScore / freshnessPenalty);
}

async function importFromLatestApifyRuns() {
  const runsUrl = `https://api.apify.com/v2/actor-runs?token=${process.env.APIFY_TOKEN}&status=SUCCEEDED&limit=30&desc=true`;

  const runsResponse = await fetch(runsUrl);

  if (!runsResponse.ok) {
    throw new Error("Could not fetch Apify runs");
  }

  const runsJson = await runsResponse.json();
  const runs = runsJson?.data?.items || [];

  let allItems: any[] = [];

  for (const run of runs) {
    const datasetId = run.defaultDatasetId;

    if (!datasetId) continue;

    const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&token=${process.env.APIFY_TOKEN}`;

    const datasetResponse = await fetch(datasetUrl);

    if (!datasetResponse.ok) continue;

    const items = await datasetResponse.json();

    allItems = allItems.concat(items);
  }

  const uniqueItems = Array.from(
    new Map(
      allItems.map((item) => [
        String(item.id || item.videoId || item.awemeId),
        item,
      ])
    ).values()
  );

  const rows = uniqueItems
    .map((item: any) => {
      const itemId = item.id || item.videoId || item.awemeId;

      const title =
        item.title ||
        item.text ||
        item.desc ||
        item.description ||
        "";

      const imageUrl =
        item["video.cover"] ||
        item["video.thumbnail"] ||
        item.videoCover ||
        item.thumbnail ||
        item.cover ||
        item.image ||
        item.video?.cover ||
        item.video?.thumbnail ||
        item.videoMeta?.coverUrl ||
        item.videoMeta?.thumbnailUrl ||
        "";

      const videoUrl =
        item["video.url"] ||
        item.videoUrl ||
        item.video?.url ||
        item.videoMeta?.downloadAddr ||
        item.videoMeta?.playAddr ||
        null;

      const audio =
        item["song.title"] ||
        item.song?.title ||
        item["music.title"] ||
        item.musicName ||
        item.audio ||
        item.musicMeta?.musicName ||
        "Unknown audio";

      const authorUsername =
        item["channel.username"] ||
        item.channel?.username ||
        item.username ||
        item.authorUsername ||
        item.author?.username ||
        item.authorMeta?.name ||
        null;

      const tiktokUrl = getTikTokUrl(item);
      const hashtags = normalizeHashtags(item, title);

      const views = getViews(item);
      const likes = getLikes(item);
      const shares = getShares(item);
      const comments = getComments(item);
      const uploadedAt = getUploadedAt(item);

      return {
        apify_id: String(itemId),
        title,
        audio,
        hashtags,
        image_url: imageUrl,
        video_url: videoUrl,
        tiktok_url: tiktokUrl,
        author_username: authorUsername,
        views,
        likes,
        shares,
        comments,
        score: freshnessScore(item),
        uploaded_at: uploadedAt,
      };
    })
    .filter((row: any) => {
      return (
        row.apify_id &&
        row.tiktok_url &&
        row.views > 0
      );
    })
    .sort((a: any, b: any) => b.score - a.score);

  if (rows.length === 0) {
    return {
      ok: true,
      imported: 0,
      top: 0,
      message: "No valid TikTok items found",
      checkedItems: allItems.length,
    };
  }

  const { error: poolError } = await supabase
    .from("trend_pool")
    .upsert(
      rows.map((row: any) => ({
        apify_id: row.apify_id,
        title: row.title,
        audio: row.audio,
        hashtags: row.hashtags,
        image_url: row.image_url,
        video_url: row.video_url,
        tiktok_url: row.tiktok_url,
        author_username: row.author_username,
        views: row.views,
        likes: row.likes,
        shares: row.shares,
        comments: row.comments,
        score: row.score,
      })),
      { onConflict: "apify_id" }
    );

  if (poolError) {
    throw new Error(poolError.message);
  }

  await supabase.from("trends").delete().neq("id", 0);

  const trends = rows.slice(0, 10).map((item: any, index: number) => ({
    position: index + 1,
    apify_id: item.apify_id,
    audio: item.audio || "Unknown audio",
    hashtags: item.hashtags || "",
    image_url: item.image_url || "",
    video_url: item.video_url,
    tiktok_url: item.tiktok_url,
    author_username: item.author_username,
    views: item.views,
    likes: item.likes,
    shares: item.shares,
    comments: item.comments,
  }));

  const { error: trendsError } = await supabase.from("trends").insert(trends);

  if (trendsError) {
    throw new Error(trendsError.message);
  }

  return {
    ok: true,
    imported: rows.length,
    top: trends.length,
    checkedItems: allItems.length,
    ranking: "freshness_score",
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");

    if (secret !== process.env.IMPORT_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await importFromLatestApifyRuns();

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}