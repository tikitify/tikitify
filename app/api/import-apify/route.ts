import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APIFY_ACTOR_ID = "apidojo~tiktok-scraper";

function extractHashtags(title: string) {
  if (!title) return "";

  const matches = title.match(/#[\wáéíóúÁÉÍÓÚñÑüÜ]+/g);

  return matches ? matches.join(" ") : "";
}

function score(item: any) {
  return (
    (item.views || 0) +
    (item.likes || 0) * 5 +
    (item.comments || 0) * 20 +
    (item.shares || 0) * 30
  );
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
  console.log(
    "APIFY RUNS FOUND:",
    runs.map((run: any) => ({
      id: run.id,
      status: run.status,
      actorId: run.actId,
      datasetId: run.defaultDatasetId,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    }))
  );

  for (const run of runs) {
    const datasetId = run.defaultDatasetId;

    if (!datasetId) continue;

    const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&token=${process.env.APIFY_TOKEN}`;

    const datasetResponse = await fetch(datasetUrl);

    if (!datasetResponse.ok) continue;

       const items = await datasetResponse.json();

    console.log("DATASET ITEMS:", datasetId, items.length, items[0]);

    allItems = allItems.concat(items);
  }

  const uniqueItems = Array.from(
    new Map(allItems.map((item) => [String(item.id), item])).values()
  );

  const rows = uniqueItems
    .filter((item: any) => item.id && item.views && item["video.cover"])
    .map((item: any) => ({
      apify_id: String(item.id),
      title: item.title || "",
      audio: item["song.title"] || "Unknown audio",
      hashtags: extractHashtags(item.title || ""),
      image_url: item["video.cover"] || item["video.thumbnail"] || "",
      video_url: item["video.url"] || null,
      tiktok_url: item.postPage || null,
      author_username: item["channel.username"] || null,
      views: item.views || 0,
      likes: item.likes || 0,
      shares: item.shares || 0,
      comments: item.comments || 0,
      score: score(item),
    }));

  if (rows.length === 0) {
    return {
      ok: true,
      imported: 0,
      message: "No valid items found",
    };
  }

  const { error: poolError } = await supabase
    .from("trend_pool")
    .upsert(rows, { onConflict: "apify_id" });

  if (poolError) {
    throw new Error(poolError.message);
  }

  const { data: topVideos, error: topError } = await supabase
    .from("trend_pool")
    .select("*")
    .order("score", { ascending: false })
    .limit(10);

  if (topError) {
    throw new Error(topError.message);
  }

  await supabase.from("trends").delete().neq("id", 0);

  const trends = (topVideos || []).map((item: any, index: number) => ({
    position: index + 1,
    apify_id: item.apify_id,
    audio: item.audio,
    hashtags: item.hashtags,
    image_url: item.image_url,
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