import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VIDEO_BUCKET = "trend-videos";
const VIDEO_FOLDER = "current";
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

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

function score(item: any) {
  const views = getViews(item);
  const likes = getLikes(item);
  const comments = getComments(item);
  const shares = getShares(item);

  return views + likes * 5 + comments * 20 + shares * 30;
}

function isPossibleVideoUrl(url: string | null) {
  if (!url) return false;

  return (
    url.startsWith("http") &&
    (
      url.includes("tiktokcdn.com") ||
      url.includes("tiktokcdn-us.com") ||
      url.includes("tiktokcdn-eu.com") ||
      url.includes("byteoversea.com")
    )
  );
}

function isValidImageUrl(url: string | null) {
  if (!url) return false;
  return url.startsWith("http");
}

async function deleteOldStoredVideos() {
  const { data, error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .list(VIDEO_FOLDER);

  if (error) {
    console.error("Storage list error:", error.message);
    return;
  }

  const filesToDelete = (data || []).map((file) => `${VIDEO_FOLDER}/${file.name}`);

  if (filesToDelete.length === 0) return;

  const { error: removeError } = await supabase.storage
    .from(VIDEO_BUCKET)
    .remove(filesToDelete);

  if (removeError) {
    console.error("Storage remove error:", removeError.message);
  }
}

async function uploadVideoToStorage(apifyId: string, sourceUrl: string) {
  const videoResponse = await fetch(sourceUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    },
  });

  if (!videoResponse.ok) {
    console.error("Video download failed:", videoResponse.status, sourceUrl);
    return null;
  }

  const contentLength = videoResponse.headers.get("content-length");

  if (contentLength && Number(contentLength) > MAX_VIDEO_SIZE_BYTES) {
    console.error("Video too large:", contentLength, sourceUrl);
    return null;
  }

  const arrayBuffer = await videoResponse.arrayBuffer();

  if (arrayBuffer.byteLength > MAX_VIDEO_SIZE_BYTES) {
    console.error("Video too large after download:", arrayBuffer.byteLength, sourceUrl);
    return null;
  }

  const filePath = `${VIDEO_FOLDER}/${apifyId}.mp4`;

  const { error: uploadError } = await supabase.storage
    .from(VIDEO_BUCKET)
    .upload(filePath, arrayBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (uploadError) {
    console.error("Storage upload error:", uploadError.message);
    return null;
  }

  const { data } = supabase.storage
    .from(VIDEO_BUCKET)
    .getPublicUrl(filePath);

  return data.publicUrl;
}

async function importFromLatestApifyRuns() {
  const runsUrl = `https://api.apify.com/v2/actor-runs?token=${process.env.APIFY_TOKEN}&status=SUCCEEDED&limit=20&desc=true`;

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
        "";

      const authorUsername =
        item["channel.username"] ||
        item.channel?.username ||
        item.username ||
        item.authorUsername ||
        item.author?.username ||
        item.authorMeta?.name ||
        null;

      const tiktokUrl =
        item.postPage ||
        item.url ||
        item.webVideoUrl ||
        null;

      const hashtags = normalizeHashtags(item, title);

      const views = getViews(item);
      const likes = getLikes(item);
      const shares = getShares(item);
      const comments = getComments(item);

      return {
        apify_id: String(itemId),
        title,
        audio,
        hashtags,
        image_url: imageUrl,
        video_url: videoUrl,
        original_video_url: videoUrl,
        tiktok_url: tiktokUrl,
        author_username: authorUsername,
        views,
        likes,
        shares,
        comments,
        score: score(item),
      };
    })
    .filter((row: any) => {
      return (
        row.apify_id &&
        row.title &&
        isPossibleVideoUrl(row.original_video_url) &&
        isValidImageUrl(row.image_url) &&
        row.views > 0
      );
    })
    .sort((a: any, b: any) => b.score - a.score);

  if (rows.length === 0) {
    return {
      ok: true,
      imported: 0,
      top: 0,
      message: "No valid video candidates found",
      checkedItems: allItems.length,
    };
  }

  const { error: poolError } = await supabase
    .from("trend_pool")
    .upsert(
      rows.map((row: any) => ({
        apify_id: row.apify_id,
        title: row.title,
        audio: row.audio || "Unknown audio",
        hashtags: row.hashtags || "",
        image_url: row.image_url,
        video_url: row.original_video_url,
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

  await deleteOldStoredVideos();

  const trends = [];

  for (const row of rows) {
    if (trends.length >= 10) break;

    const storedVideoUrl = await uploadVideoToStorage(
      row.apify_id,
      row.original_video_url
    );

    if (!storedVideoUrl) continue;

    trends.push({
      position: trends.length + 1,
      apify_id: row.apify_id,
      audio: row.audio || "Unknown audio",
      hashtags: row.hashtags || "",
      image_url: row.image_url,
      video_url: storedVideoUrl,
      tiktok_url: row.tiktok_url,
      author_username: row.author_username,
      views: row.views,
      likes: row.likes,
      shares: row.shares,
      comments: row.comments,
    });
  }

  await supabase.from("trends").delete().neq("id", 0);

  if (trends.length > 0) {
    const { error: trendsError } = await supabase
      .from("trends")
      .insert(trends);

    if (trendsError) {
      throw new Error(trendsError.message);
    }
  }

  return {
    ok: true,
    imported: rows.length,
    top: trends.length,
    checkedItems: allItems.length,
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