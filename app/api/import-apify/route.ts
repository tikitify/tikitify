import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");

    if (secret !== process.env.IMPORT_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const datasetId =
      body?.resource?.defaultDatasetId ||
      body?.resource?.datasetId ||
      body?.defaultDatasetId;

    if (!datasetId) {
      return NextResponse.json(
        { error: "No datasetId found", body },
        { status: 400 }
      );
    }

    const apifyUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&token=${process.env.APIFY_TOKEN}`;

    const response = await fetch(apifyUrl);

    if (!response.ok) {
      return NextResponse.json(
        { error: "Error fetching Apify dataset" },
        { status: 500 }
      );
    }

    const items = await response.json();

    const rows = items
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
      return NextResponse.json({
        ok: true,
        message: "No valid items found",
      });
    }

    const { error: poolError } = await supabase
      .from("trend_pool")
      .upsert(rows, { onConflict: "apify_id" });

    if (poolError) {
      return NextResponse.json({ error: poolError.message }, { status: 500 });
    }

    const { data: topVideos, error: topError } = await supabase
      .from("trend_pool")
      .select("*")
      .order("score", { ascending: false })
      .limit(10);

    if (topError) {
      return NextResponse.json({ error: topError.message }, { status: 500 });
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

    const { error: trendsError } = await supabase
      .from("trends")
      .insert(trends);

    if (trendsError) {
      return NextResponse.json({ error: trendsError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      imported: rows.length,
      top: trends.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}