const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const dataFolder = path.join(__dirname, "../data");

function extractHashtags(title) {
  if (!title) return "";

  const matches = title.match(/#[\wáéíóúÁÉÍÓÚñÑüÜ]+/g);

  return matches ? matches.join(" ") : "";
}

function tikitifyScore(item) {
  return (
    (item.views || 0) +
    (item.likes || 0) * 5 +
    (item.comments || 0) * 20 +
    (item.shares || 0) * 30
  );
}

async function importTrends() {
  const files = fs
    .readdirSync(dataFolder)
    .filter((file) => file.endsWith(".json"));

  let allResults = [];

  for (const file of files) {
    const filePath = path.join(dataFolder, file);
    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw);

    allResults = allResults.concat(json);
  }

  const uniqueResults = Array.from(
    new Map(allResults.map((item) => [String(item.id), item])).values()
  );

  const sortedResults = uniqueResults
    .filter((item) => item.views && item["video.cover"])
    .sort((a, b) => tikitifyScore(b) - tikitifyScore(a))
    .slice(0, 10);

  const trends = sortedResults.map((item, index) => ({
    position: index + 1,
    apify_id: String(item.id),
    audio: item["song.title"] || "Unknown audio",
    hashtags: extractHashtags(item.title),
    image_url: item["video.cover"] || item["video.thumbnail"] || "",
    video_url: item["video.url"] || null,
    tiktok_url: item.postPage || null,
    author_username: item["channel.username"] || null,
    views: item.views || 0,
    likes: item.likes || 0,
    shares: item.shares || 0,
    comments: item.comments || 0,
  }));

  await supabase.from("trends").delete().neq("id", 0);

  const { error } = await supabase.from("trends").insert(trends);

  if (error) {
    console.error("Error inserting trends:", error);
    return;
  }

  console.log("✅ Tikitify Top 10 imported");
  console.table(
    trends.map((t) => ({
      position: t.position,
      audio: t.audio,
      views: t.views,
      likes: t.likes,
    }))
  );
}

importTrends();