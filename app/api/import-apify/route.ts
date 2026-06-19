import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MIN_GLOBAL_VIEWS = 1000000;
const MIN_SPAIN_VIEWS = 100000;
const HISTORY_RESET_HOURS = 48;

type HistoryValue = {
  timesSeen: number;
  firstSeen: string | null;
  lastSeen: string | null;
};

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
  return normalizeTikTokUrl(
    item.postPage ||
      item.url ||
      item.webVideoUrl ||
      item["postPage"] ||
      item["webVideoUrl"] ||
      null
  );
}

function getItemKey(item: any) {
  const tiktokUrl = getTikTokUrl(item);

  return (
    item.id ||
    item.videoId ||
    item.awemeId ||
    item["id"] ||
    item["videoId"] ||
    item["awemeId"] ||
    tiktokUrl ||
    null
  );
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

function getHoursSince(dateValue: string | null) {
  if (!dateValue) return 999999;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return 999999;

  const diffMs = Date.now() - date.getTime();
  return Math.max(diffMs / (1000 * 60 * 60), 1);
}

function getFullDaysSince(dateValue: string | null) {
  if (!dateValue) return 0;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return 0;

  const diffMs = Date.now() - date.getTime();
  return Math.max(Math.floor(diffMs / (1000 * 60 * 60 * 24)), 0);
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
    .select("apify_id, market, first_seen, last_seen, times_seen");

  if (error) {
    console.error("History fetch error:", error.message);
    return new Map<string, HistoryValue>();
  }

  const map = new Map<string, HistoryValue>();

  for (const item of data || []) {
    map.set(`${item.market}_${item.apify_id}`, {
      timesSeen: item.times_seen || 0,
      firstSeen: item.first_seen || null,
      lastSeen: item.last_seen || null,
    });
  }

  return map;
}

function applySmartRotation(
  rows: any[],
  market: "global" | "spain",
  historyMap: Map<string, HistoryValue>
) {
  const sortedByViews = [...rows].sort((a, b) => b.views - a.views);

  return sortedByViews
    .map((row, index) => {
      const history = historyMap.get(`${market}_${row.apify_id}`);
      const hoursSinceLastSeen = getHoursSince(history?.lastSeen || null);

      const activeDaysSeen =
  hoursSinceLastSeen <= HISTORY_RESET_HOURS
    ? getFullDaysSince(history?.firstSeen || null)
    : 0;

let demotionMultiplier = 0;

if (index <= 2) {
  // Top 1-3
  demotionMultiplier = 2;
} else if (index <= 5) {
  // Top 4-6
  demotionMultiplier = 1;
} else {
  // Top 7-10
  demotionMultiplier = 0;
}

const demotionSlots = Math.min(
  activeDaysSeen * demotionMultiplier,
  8
);

      return {
        ...row,
        market,
        days_seen: activeDaysSeen,
        original_rank: index + 1,
        adjusted_rank: index + 1 + demotionSlots,
      };
    })
    .sort((a, b) => {
      if (a.adjusted_rank !== b.adjusted_rank) {
        return a.adjusted_rank - b.adjusted_rank;
      }

      return b.views - a.views;
    });
}

function selectTopVideos(
  rows: any[],
  minViews: number,
  market: "global" | "spain",
  historyMap: Map<string, HistoryValue>
) {
  const validRows = rows.filter((row) => row.views > 0 && row.tiktok_url);

  const last48h = validRows.filter((row) => row.age_hours <= 48);
  const last7days = validRows.filter((row) => row.age_hours <= 168);
  const last30days = validRows.filter((row) => row.age_hours <= 720);

  const rotated48h = applySmartRotation(last48h, market, historyMap);
  const rotated7d = applySmartRotation(last7days, market, historyMap);
  const rotated30d = applySmartRotation(last30days, market, historyMap);
  const rotatedAll = applySmartRotation(validRows, market, historyMap);

  if (rotated48h.length >= 10 && rotated48h[9].views >= minViews) {
    return {
      rows: rotated48h.slice(0, 10),
      ranking: "last_48h_by_views_daily_rotation",
    };
  }

  if (rotated7d.length >= 10 && rotated7d[9].views >= minViews) {
    return {
      rows: rotated7d.slice(0, 10),
      ranking: "last_7d_by_views_daily_rotation",
    };
  }

  if (rotated30d.length >= 10) {
    return {
      rows: rotated30d.slice(0, 10),
      ranking: "last_30d_by_views_daily_rotation",
    };
  }

  return {
    rows: rotatedAll.slice(0, 10),
    ranking: "all_by_views_daily_rotation",
  };
}

async function updateTrendHistory(trends: any[]) {
  if (trends.length === 0) return;

  await supabase
    .from("trend_history")
    .delete()
    .lt(
      "last_seen",
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    );
    
  const { data: existingHistory, error: historyError } = await supabase
    .from("trend_history")
    .select("apify_id, market, first_seen, last_seen, times_seen");

  if (historyError) {
    console.error("History read error:", historyError.message);
    return;
  }

  const existingMap = new Map<string, any>();

  for (const item of existingHistory || []) {
    existingMap.set(`${item.market}_${item.apify_id}`, item);
  }

  const now = new Date().toISOString();

  const historyRows = trends.map((trend) => {
    const existing = existingMap.get(`${trend.market}_${trend.apify_id}`);
    const hoursSinceLastSeen = getHoursSince(existing?.last_seen || null);
    const shouldReset = hoursSinceLastSeen > HISTORY_RESET_HOURS;

    return {
      apify_id: trend.apify_id,
      market: trend.market,
      first_seen: shouldReset ? now : existing?.first_seen || now,
      last_seen: now,
      times_seen: shouldReset ? 1 : (existing?.times_seen || 0) + 1,
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
      allItems.map((item) => {
        const itemKey = getItemKey(item);
        return [String(itemKey), item];
      })
    ).values()
  );

  const rows = uniqueItems
    .map((item: any) => {
      const itemKey = getItemKey(item);

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
        apify_id: String(itemKey),
        input_source: item.inputSource || item.search || item.query || item.keyword || "",
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
      return (
        row.apify_id &&
        row.apify_id !== "null" &&
        row.apify_id !== "undefined" &&
        row.tiktok_url &&
        row.views > 0
      );
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
  const globalRows = rows.filter((row: any) => !isSpainCandidate(row));

  const globalSelection = selectTopVideos(
    globalRows,
    MIN_GLOBAL_VIEWS,
    "global",
    historyMap
  );

  const spainSelection = selectTopVideos(
    spainRows,
    MIN_SPAIN_VIEWS,
    "spain",
    historyMap
  );

  const poolRows = [
    ...globalRows.map((row: any) => ({
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

    checkedItems: allItems.length,
    uniqueItems: uniqueItems.length,
    imported: rows.length,

    globalCandidates: globalRows.length,
    spainCandidates: spainRows.length,

    topGlobal: globalTrends.length,
    topSpain: spainTrends.length,

    globalRanking: globalSelection.ranking,
    spainRanking: spainSelection.ranking,

    rotation: "daily_position_demotion",
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