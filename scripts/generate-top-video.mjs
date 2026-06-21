import { bundle } from "@remotion/bundler";
import { getVideoMetadata, renderMedia, selectComposition } from "@remotion/renderer";
import { createClient } from "@supabase/supabase-js";
import ytDlpWrapModule from "yt-dlp-wrap";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const YTDlpWrap = ytDlpWrapModule.default || ytDlpWrapModule;

dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env") });

const fps = 30;
const storyDurationInFrames = 18 * fps;
const outroDurationInFrames = 4 * fps;
const generatedDir = path.join(projectRoot, "public", "generated", "videos");
const backgroundSourcePath = path.join(generatedDir, "background-source.mp4");
const outroAudioPath = path.join(projectRoot, "public", "audio.mp3");
const remotionEntry = path.join(projectRoot, "remotion", "index.tsx");
const ytDlpBinaryPath = path.join(projectRoot, "tools", "yt-dlp.exe");

const market = normalizeMarket(process.env.TIKITIFY_VIDEO_MARKET || "global");
const targetInput = process.argv.find((arg) => arg.includes("tikitify.com/video/") || /^\d{12,}$/.test(arg)) || process.env.TIKITIFY_VIDEO_TARGET || "";
const targetVideoId = extractVideoId(targetInput);

function normalizeMarket(value) {
  return value === "spain" ? "spain" : "global";
}

function oppositeMarket(value) {
  return normalizeMarket(value) === "global" ? "spain" : "global";
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function extractVideoId(value) {
  if (!value) return null;
  const match = String(value).match(/(?:video\/)?(\d{12,})/);
  return match ? match[1] : null;
}

function spokenNumber(value) {
  if (!value) return "muchas";
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)} mil millones`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)} millones`;
  if (value >= 1000) return `${Math.round(value / 1000)} mil`;
  return String(value);
}

function normalizeAccent(text) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function inferStoryAngle(trend) {
  const source = normalizeAccent(
    [trend.title, trend.audio, trend.hashtags, trend.author_username].filter(Boolean).join(" ")
  );

  const patterns = [
    { keywords: ["futbol", "football", "goal", "gol", "mundial", "champions"], topic: "futbol", action: "una jugada o una reaccion de futbol" },
    { keywords: ["humor", "meme", "comedia", "broma", "funny", "lol"], topic: "humor", action: "una broma que engancha al instante" },
    { keywords: ["baile", "dance", "dancing", "coreo", "tiktokdance"], topic: "baile", action: "un baile muy corto y muy pegadizo" },
    { keywords: ["maquillaje", "beauty", "makeup", "skincare", "belleza"], topic: "belleza", action: "un cambio de imagen muy rapido" },
    { keywords: ["cocina", "food", "recipe", "receta", "comida"], topic: "cocina", action: "una receta o un plato que entra por los ojos" },
    { keywords: ["viaje", "travel", "trip", "paris", "london", "spain"], topic: "viaje", action: "un momento de viaje o calle muy visual" },
    { keywords: ["drama", "polemica", "conflict", "controversia"], topic: "polemica", action: "una escena con tension y mucha reaccion" },
    { keywords: ["gaming", "juego", "gamer", "videogame"], topic: "videojuegos", action: "una partida o una reaccion de gaming" },
    { keywords: ["baby", "bebe", "child", "kid", "toddl"], topic: "familia", action: "un momento familiar muy natural" },
  ];

  return patterns.find((entry) => entry.keywords.some((keyword) => source.includes(keyword))) || {
    topic: "video viral",
    action: "un clip corto que engancha desde el primer segundo",
  };
}

function createSupabase() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}

async function nextTopOutputPath() {
  await fs.mkdir(generatedDir, { recursive: true });
  const files = await fs.readdir(generatedDir).catch(() => []);
  const usedNumbers = files
    .map((file) => file.match(/^top(\d+)\.mp4$/i))
    .filter(Boolean)
    .map((match) => Number.parseInt(match[1], 10));
  const nextNumber = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1;
  return {
    outputName: `top${nextNumber}.mp4`,
    outputPath: path.join(generatedDir, `top${nextNumber}.mp4`),
  };
}
async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

function toCandidate(row) {
  return {
    apify_id: String(row.apify_id || ""),
    position: typeof row.position === "number" ? row.position : 0,
    market: normalizeMarket(row.market),
    title: row.title || null,
    audio: row.audio || null,
    hashtags: row.hashtags || null,
    image_url: row.image_url || null,
    video_url: row.video_url || null,
    views: typeof row.views === "number" ? row.views : null,
    likes: typeof row.likes === "number" ? row.likes : null,
    tiktok_url: row.tiktok_url || null,
    author_username: row.author_username || null,
    score: typeof row.score === "number" ? row.score : null,
  };
}

async function fetchRows(table, selectedMarket) {
  const supabase = createSupabase();
  const query = supabase.from(table).select("*").eq("market", selectedMarket);
  const ordered = table === "trends"
    ? query.order("position", { ascending: true })
    : query.order("score", { ascending: false }).limit(80);
  const { data, error } = await ordered;
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchCandidatesForMarket(selectedMarket) {
  const currentRows = await fetchRows("trends", selectedMarket);
  let poolRows = [];
  try {
    poolRows = await fetchRows("trend_pool", selectedMarket);
  } catch (error) {
    console.warn(`trend_pool fallback unavailable: ${error.message}`);
  }

  const candidates = [];
  const seen = new Set();
  for (const row of [...currentRows, ...poolRows]) {
    const candidate = toCandidate(row);
    if (!candidate.apify_id || seen.has(candidate.apify_id)) continue;
    seen.add(candidate.apify_id);
    candidates.push(candidate);
  }
  return candidates;
}

async function fetchCandidates() {
  const candidates = [
    ...(await fetchCandidatesForMarket(market)),
    ...(await fetchCandidatesForMarket(oppositeMarket(market))),
  ];

  if (!targetVideoId) return candidates;

  const matches = candidates.filter((candidate) => {
    return candidate.apify_id.includes(targetVideoId)
      || candidate.tiktok_url?.includes(targetVideoId)
      || candidate.video_url?.includes(targetVideoId);
  });

  if (!matches.length) {
    throw new Error(`Video ${targetVideoId} was not found in trends or trend_pool.`);
  }

  return matches;
}

async function downloadAndValidateVideo(url, destinationPath) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "video/*,application/octet-stream,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  await fs.writeFile(destinationPath, Buffer.from(await response.arrayBuffer()));
  const metadata = await getVideoMetadata(destinationPath);
  if (!metadata.width || !metadata.height || !metadata.durationInSeconds) {
    throw new Error("Downloaded file is not a valid video");
  }
  return metadata;
}

async function ensureYtDlpBinary() {
  if (existsSync(ytDlpBinaryPath)) return ytDlpBinaryPath;
  await fs.mkdir(path.dirname(ytDlpBinaryPath), { recursive: true });
  await YTDlpWrap.downloadFromGithub(ytDlpBinaryPath);
  return ytDlpBinaryPath;
}

async function downloadWithYtDlp(pageUrl, destinationPath) {
  const ytDlp = new YTDlpWrap(await ensureYtDlpBinary());
  await ytDlp.execPromise([
    pageUrl,
    "-f",
    "mp4/bestvideo[ext=mp4]+bestaudio/best",
    "--merge-output-format",
    "mp4",
    "-o",
    destinationPath,
    "--no-playlist",
    "--restrict-filenames",
    "--no-part",
  ]);
  const metadata = await getVideoMetadata(destinationPath);
  if (!metadata.width || !metadata.height || !metadata.durationInSeconds) {
    throw new Error("yt-dlp output was not a valid video");
  }
  return metadata;
}

async function findDownloadableBackground(candidates) {
  await fs.mkdir(path.dirname(backgroundSourcePath), { recursive: true });
  await fs.rm(backgroundSourcePath, { force: true });

  for (const [index, candidate] of candidates.entries()) {
    if (!candidate.video_url && !candidate.tiktok_url) continue;
    try {
      const tempPath = `${backgroundSourcePath}.candidate-${index}.mp4`;
      try {
        if (!candidate.video_url) throw new Error("No direct video_url");
        await downloadAndValidateVideo(candidate.video_url, tempPath);
      } catch (directError) {
        if (!candidate.tiktok_url) throw directError;
        console.warn(`Direct MP4 failed for ${candidate.apify_id}; trying yt-dlp against the TikTok page.`);
        await downloadWithYtDlp(candidate.tiktok_url, tempPath);
      }
      await fs.rename(tempPath, backgroundSourcePath);
      return { candidate };
    } catch (error) {
      console.warn(`Skipping ${candidate.apify_id} because the MP4 could not be downloaded: ${error.message}`);
      await fs.rm(`${backgroundSourcePath}.candidate-${index}.mp4`, { force: true });
    }
  }
  throw new Error("No downloadable MP4 source was found.");
}

function buildSubtitleScript(trend, angle) {
  return [
    "Este video esta subiendo fuerte en TikTok.",
    `En pantalla se ve ${angle.action}.`,
    "Funciona porque se entiende al instante y deja una reaccion clara.",
    `Ya acumula ${spokenNumber(trend.views)} visualizaciones y ${spokenNumber(trend.likes)} me gusta.`,
    `Ahora mismo aparece como tendencia numero ${trend.position || 1} en Tikitify.`,
  ];
}

function buildCaptions(scriptLines) {
  const usableSeconds = storyDurationInFrames / fps;
  const usableFrames = Math.max(1, Math.round(usableSeconds * fps));
  const weights = scriptLines.map((line) => Math.max(line.length, 12));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let cursor = 0;

  return scriptLines.map((text, index) => {
    const remaining = usableFrames - cursor;
    const raw = Math.max(36, Math.round((usableFrames * weights[index]) / totalWeight));
    const duration = index === scriptLines.length - 1 ? remaining : Math.min(raw, remaining);
    const startFrame = cursor;
    const endFrame = index === scriptLines.length - 1 ? usableFrames : cursor + duration;
    cursor = endFrame;
    return { startFrame, endFrame, text };
  });
}

async function main() {
  if (!existsSync(outroAudioPath)) throw new Error("public/audio.mp3 is missing. The outro audio must exist.");
  const candidates = await fetchCandidates();
  if (!candidates.length) throw new Error(`No candidate trends found for market "${market}".`);

  const { candidate } = await findDownloadableBackground(candidates);
  const angle = inferStoryAngle(candidate);
  const scriptLines = buildSubtitleScript(candidate, angle);
  const captions = buildCaptions(scriptLines);
  const { outputName, outputPath } = await nextTopOutputPath();

  const bundleLocation = await bundle({ entryPoint: remotionEntry });
  const inputProps = {
    trend: {
      apify_id: candidate.apify_id,
      position: candidate.position || 1,
      market: candidate.market,
      title: candidate.title,
      audio: candidate.audio,
      hashtags: candidate.hashtags,
      image_url: candidate.image_url,
      video_url: candidate.video_url,
      views: candidate.views,
      likes: candidate.likes,
      tiktok_url: candidate.tiktok_url,
      author_username: candidate.author_username,
    },
    storyAngleTopic: angle.topic,
    storyAngleAction: angle.action,
    backgroundVideoSrc: "generated/videos/background-source.mp4",
    outroAudioSrc: "audio.mp3",
    captions,
    storyDurationInFrames,
    outroDurationInFrames,
  };

  const composition = await selectComposition({ serveUrl: bundleLocation, id: "TopViralStory", inputProps });
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    audioCodec: "aac",
    inputProps,
    outputLocation: outputPath,
  });

  await writeJson(path.join(generatedDir, `${path.basename(outputName, ".mp4")}-selection.json`), {
    market,
    targetVideoId,
    selectedTrend: candidate,
    outputPath,
  });
  console.log(`Generated: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});