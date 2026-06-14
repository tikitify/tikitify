import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MIN_GLOBAL_VIEWS = 1000000;
const MIN_SPAIN_VIEWS = 100000;

function extractHashtags(title: string) {
  if (!title) return "";
  const matches = title.match(/#[\wáéíóúÁÉÍÓÚñÑüÜ]+/g);
  return matches ? matches.join(" ") : "";
}

function normalizeHashtags(item: any, title: string) {
  if (Array.isArray(item.hashtags) && item.hashtags.length > 0) {
    return item.hashtags
      .map((tag: any) => {
        if (typeof tag === "string") {
          const cleanTag = tag.replace("#", "").trim();
          return cleanTag ? `#${cleanTag}` : "";
        }

        if (tag && typeof tag === "object") {
          const possibleTag =
            tag.name ||
            tag.title ||
            tag.hashtag ||
            tag.hashtagName ||
            tag.text ||
            "";

          const cleanTag = String(possibleTag).replace("#", "").trim();
          return cleanTag ? `#${cleanTag}` : "";
        }

        return "";
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

function normalizeTikTokUrl(url: string | null) {
  if (!url) return null;
  return url.replace("http://", "https://");
}

function getTikTokUrl(item: any) {
  return normalizeTikTokUrl(item.postPage || item.url || item.webVideoUrl || null);
}

function getUploadedAt(item: any) {
  return item.uploadedAtFormatted || item.uploadedAt || item.createTime || null;
}

function getAgeHours(uploadedAt: any) {
  if (!uploadedAt) return 999999;

  let date: Date;

  if (typeof uploadedAt === "number") {
    date = new Date(uploadedAt * 1000);
  } else {
    date = new Date(uploadedAt);
  }

  if (Number.isNaN(date.getTime())) return 999999;

  const diffMs = Date.now() - date.getTime();
  return Math.max(diffMs / (1000 * 60 * 60), 1);
}

function isSpainCandidate(row: any) {
  const text = [
    row.input_source,
    row.title,
    row.hashtags,
    row.author_username,
  ]
    .join(" ")
    .toLowerCase();

  return (
    text.includes("españa") ||
    text.includes("spain") ||
    text.includes("español") ||
    text.includes("española") ||
    text.includes("madrid") ||
    text.includes("barcelona") ||
    text.includes("valencia") ||
    text.includes("sevilla") ||
    text.includes("humor español") ||
    text.includes("comedia españa") ||
    text.includes("futbol españa") ||
    text.includes("fútbol españa")
  );
}

async function getHistoryMap() {
  const { data, error } = await supabase
    .from("trend_history")
    .select("apify_id, market, times_seen");

  if (error) {
    console.error("History fetch error:", error.message);
    return new Map<string, number>();
  }

  const map = new Map<string, number>();

  for (const item of data || []) {
    map.set(`${item.market}_${item.apify_id}`, item.times_seen || 0);
  }

  return map;
}

function applyHistoryPenalty(rows: any[], market: "global" | "spain", historyMap: Map<string, number>) {
  return rows.map((row) => {
    const timesSeen = historyMap.get(`${market}_${row.apify_id}`) || 0;

    let penalty = 1;

    if (timesSeen === 1) penalty = 0.85;
    if (timesSeen === 2) penalty = 0.65;
    if (timesSeen >= 3) penalty = 0.45;
    if (timesSeen >= 5) penalty = 0.25;

    return {
      ...row,
      market,
      times_seen: timesSeen,
      ranking_score: row.views * penalty,
    };
  });
}

function selectTopVideos(rows: any[], minViews: number, market: "global" | "spain", historyMap: Map<string, number>) {
  const validRows = rows.filter((row) => row.views > 0 && row.tiktok_url);

  const last48h = validRows.filter((row) => row.age_hours <= 48);
  const last7days = validRows.filter((row) => row.age_hours <= 168);
  const last30days = validRows.filter((row) => row.age_hours <= 720);

  const sortWithPenalty = (items: any[]) =>
    applyHistoryPenalty(items, market, historyMap).sort((a, b) => {
      if (b.ranking_score !== a.ranking_score) {
        return b.ranking_score - a.ranking_score;
      }

      return b.views - a.views;
    });

  const sorted48h = sortWithPenalty(last48h);
  const sorted7d = sortWithPenalty(last7days);
  const sorted30d = sortWithPenalty(last30days);
  const sortedAll = sortWithPenalty(validRows);

  if (sorted48h.length >= 10 && sorted48h[9].views >= minViews) {
    return { rows: sorted48h.slice(0, 10), ranking: "last_48h_by_views_with_rotation" };
  }

  if (sorted7d.length >= 10 && sorted7d[9].views >= minViews) {
    return { rows: sorted7d.slice(0, 10), ranking: "last_7d_by_views_with_rotation" };
  }

  if (sorted30d.length >= 10) {
    return { rows: sorted30d.slice(0, 10), ranking: "last_30d_by_views_with_rotation" };
  }

  return { rows: sortedAll.slice(0, 10), ranking: "all_by_views_with_rotation" };
}

async function updateTrendHistory(trends: any[]) {
  if (trends.length === 0) return;

  const keys = trends.map((trend) => ({
    apify_id: trend.apify_id,
    market: trend.market,
  }));

  const { data: existingHistory, error: historyError } = await supabase
    .from("trend_history")
    .select("apify_id, market, first_seen, times_seen");

  if (historyError) {
    console.error("History read error:", historyError.message);
    return;
  }

  const existingMap = new Map<string, any>();

  for (const item of existingHistory || []) {
    existingMap.set(`${item.market}_${item.apify_id}`, item);
  }

  const now = new Date().toISOString();

  const historyRows = keys.map((key) => {
    const existing = existingMap.get(`${key.market}_${key.apify_id}`);

    return {
      apify_id: key.apify_id,
      market: key.market,
      first_seen: existing?.first_seen || now,
      last_seen: now,
      times_seen: (existing?.times_seen || 0) + 1,
    };
  });

  const { error: upsertError } = await supabase
    .from("trend_history")
    .upsert(historyRows, { onConflict: "apify_id,market" });

  if (upsertError) {
    console.error("History upsert error:", upsertError.message);
  }
}

async function importFromLatestApifyRuns() {
  const historyMap = await getHistoryMap();

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
      const ageHours = getAgeHours(uploadedAt);

      return {
        apify_id: String(itemId),
        input_source: item.inputSource || item.search || item.query || "",
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
        score: views,
        uploaded_at: uploadedAt,
        age_hours: ageHours,
      };
    })
    .filter((row: any) => {
      return row.apify_id && row.tiktok_url && row.views > 0;
    });

  if (rows.length === 0) {
    return {
      ok: true,
      imported: 0,
      topGlobal: 0,
      topSpain: 0,
      checkedItems: allItems.length,
      message: "No valid TikTok items found",
    };
  }

  const spainRows = rows.filter(isSpainCandidate);

  const globalSelection = selectTopVideos(rows, MIN_GLOBAL_VIEWS, "global", historyMap);
  const spainSelection = selectTopVideos(spainRows, MIN_SPAIN_VIEWS, "spain", historyMap);

  const poolRows = [
    ...rows.map((row: any) => ({
      ...row,
      market: "global",
    })),
    ...spainRows.map((row: any) => ({
      ...row,
      market: "spain",
    })),
  ];

  const { error: poolError } = await supabase
    .from("trend_pool")
    .upsert(
      poolRows.map((row: any) => ({
        apify_id: `${row.market}_${row.apify_id}`,
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
        market: row.market,
      })),
      { onConflict: "apify_id" }
    );

  if (poolError) {
    throw new Error(poolError.message);
  }

  await supabase.from("trends").delete().neq("id", 0);

  const globalTrends = globalSelection.rows.map((item: any, index: number) => ({
    position: index + 1,
    market: "global",
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

  const spainTrends = spainSelection.rows.map((item: any, index: number) => ({
    position: index + 1,
    market: "spain",
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

  const trends = [...globalTrends, ...spainTrends];

  if (trends.length > 0) {
    const { error: trendsError } = await supabase
      .from("trends")
      .insert(trends);

    if (trendsError) {
      throw new Error(trendsError.message);
    }

    await updateTrendHistory(trends);
  }

  return {
    ok: true,
    imported: rows.length,
    topGlobal: globalTrends.length,
    topSpain: spainTrends.length,
    checkedItems: allItems.length,
    globalRanking: globalSelection.ranking,
    spainRanking: spainSelection.ranking,
    spainCandidates: spainRows.length,
    rotation: "enabled",
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