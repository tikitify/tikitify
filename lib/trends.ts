import { createClient } from "@supabase/supabase-js";
import {
  extractHashtagNames,
  normalizeHashtagName,
  trendMatchesHashtag,
  type Market,
  type Trend,
} from "./hashtags";

type TrendRow = Partial<Trend> & {
  score?: number | null;
  market?: string | null;
};

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function toTrend(row: TrendRow, index: number): Trend {
  return {
    id: typeof row.id === "number" ? row.id : undefined,
    apify_id: String(row.apify_id || ""),
    position: typeof row.position === "number" ? row.position : index + 1,
    market: row.market === "spain" ? "spain" : "global",
    audio: row.audio || null,
    hashtags: row.hashtags || null,
    image_url: row.image_url || null,
    video_url: row.video_url || null,
    views: typeof row.views === "number" ? row.views : null,
    likes: typeof row.likes === "number" ? row.likes : null,
    shares: typeof row.shares === "number" ? row.shares : null,
    comments: typeof row.comments === "number" ? row.comments : null,
    tiktok_url: row.tiktok_url || null,
    author_username: row.author_username || null,
  };
}

export async function getCurrentTrends() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("trends")
    .select("*")
    .order("market", { ascending: true })
    .order("position", { ascending: true });

  if (error) {
    console.error(error.message);
    return [];
  }

  return ((data || []) as TrendRow[]).map(toTrend);
}

export async function getTrendsByMarket(market: Market) {
  const trends = await getCurrentTrends();
  return trends.filter((trend) => trend.market === market);
}

export async function getVideosByHashtag(hashtag: string) {
  const normalized = normalizeHashtagName(hashtag);
  if (!normalized) return [];

  const supabase = getSupabase();
  const queryTag = normalized.replace(/[%_]/g, "");

  const { data: currentData, error: currentError } = await supabase
    .from("trends")
    .select("*")
    .ilike("hashtags", `%#${queryTag}%`)
    .order("position", { ascending: true });

  if (currentError) {
    console.error(currentError.message);
  }

  const { data: poolData, error: poolError } = await supabase
    .from("trend_pool")
    .select("*")
    .ilike("hashtags", `%#${queryTag}%`)
    .order("score", { ascending: false })
    .limit(80);

  if (poolError) {
    console.error(poolError.message);
  }

  const uniqueRows = new Map<string, TrendRow>();
  const rows = [...(currentData || []), ...(poolData || [])] as TrendRow[];

  for (const row of rows) {
    const key =
      row.tiktok_url ||
      String(row.apify_id || "").replace(/^(global|spain)_/, "");
    if (key && !uniqueRows.has(key)) uniqueRows.set(key, row);
  }

  return Array.from(uniqueRows.values())
    .filter((row) => trendMatchesHashtag(row, normalized))
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 24)
    .map(toTrend);
}

export async function getSitemapHashtags(max = 500) {
  const supabase = getSupabase();

  const { data: currentTrends, error: currentError } = await supabase
    .from("trends")
    .select("hashtags")
    .limit(50);

  if (currentError) {
    console.error(currentError.message);
  }

  const { data: poolTrends, error: poolError } = await supabase
    .from("trend_pool")
    .select("hashtags")
    .order("score", { ascending: false })
    .limit(1000);

  if (poolError) {
    console.error(poolError.message);
  }

  const unique = new Map<string, string>();
  const rows = [...(currentTrends || []), ...(poolTrends || [])] as Pick<
    Trend,
    "hashtags"
  >[];

  for (const row of rows) {
    for (const tag of extractHashtagNames(row.hashtags)) {
      if (!unique.has(tag)) unique.set(tag, tag);
      if (unique.size >= max) return Array.from(unique.values());
    }
  }

  return Array.from(unique.values());
}
