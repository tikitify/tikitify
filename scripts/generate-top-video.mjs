import { bundle } from "@remotion/bundler";
import { getVideoMetadata, renderMedia, selectComposition } from "@remotion/renderer";
import { createClient } from "@supabase/supabase-js";
import ytDlpWrapModule from "yt-dlp-wrap";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
const voiceoverPath = path.join(generatedDir, "top-viral-story-voiceover.mp3");
const outputPath = path.join(generatedDir, "top-viral-story.mp4");
const outroAudioPath = path.join(projectRoot, "public", "audio.mp3");
const remotionEntry = path.join(projectRoot, "remotion", "index.tsx");
const ytDlpBinaryPath = path.join(projectRoot, "tools", "yt-dlp.exe");

const market = normalizeMarket(process.env.TIKITIFY_VIDEO_MARKET || "global");
const elevenLabsVoiceName = process.env.ELEVENLABS_VOICE_NAME || "Matilde";
const elevenLabsModelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

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

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

async function fetchCandidatesForMarket(selectedMarket) {
  const supabase = createSupabase();
  const { data: currentRows, error: currentError } = await supabase
    .from("trends")
    .select("*")
    .eq("market", selectedMarket)
    .order("position", { ascending: true });
  if (currentError) throw new Error(currentError.message);

  const { data: poolRows, error: poolError } = await supabase
    .from("trend_pool")
    .select("*")
    .eq("market", selectedMarket)
    .order("score", { ascending: false })
    .limit(40);
  if (poolError) console.warn(`trend_pool fallback unavailable: ${poolError.message}`);

  const candidates = [];
  const seen = new Set();
  for (const row of [...(currentRows || []), ...(poolRows || [])]) {
    if (!row?.apify_id || seen.has(row.apify_id)) continue;
    seen.add(row.apify_id);
    candidates.push({
      apify_id: String(row.apify_id),
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
    });
  }
  return candidates;
}

async function fetchCandidates() {
  return [
    ...(await fetchCandidatesForMarket(market)),
    ...(await fetchCandidatesForMarket(oppositeMarket(market))),
  ];
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

function buildVoiceoverScript(trend, angle) {
  return [
    "Este video esta arrasando en TikTok.",
    `Se ve ${angle.action}.`,
    `Ya suma ${spokenNumber(trend.views)} visualizaciones y ${spokenNumber(trend.likes)} me gusta.`,
    `Esta subiendo hasta el puesto numero ${trend.position || 1}.`,
    "Encuentra los videos mas virales en Tikitify.",
  ];
}

async function resolveElevenLabsVoiceId() {
  if (process.env.ELEVENLABS_VOICE_ID) return process.env.ELEVENLABS_VOICE_ID;
  const apiKey = requiredEnv("ELEVENLABS_API_KEY");
  const url = new URL("https://api.elevenlabs.io/v2/voices");
  url.searchParams.set("search", elevenLabsVoiceName);
  url.searchParams.set("page_size", "100");

  const response = await fetch(url, { headers: { "xi-api-key": apiKey } });
  if (!response.ok) throw new Error(`ElevenLabs voice search failed: ${response.status} ${await response.text()}`);

  const result = await response.json();
  const target = normalizeAccent(elevenLabsVoiceName);
  const voice = (result.voices || []).find((item) => normalizeAccent(item.name || "") === target)
    || (result.voices || []).find((item) => normalizeAccent(item.name || "").includes(target));
  if (!voice?.voice_id) {
    throw new Error(`Could not find an ElevenLabs voice named "${elevenLabsVoiceName}". Set ELEVENLABS_VOICE_ID manually if needed.`);
  }
  return voice.voice_id;
}

async function generateVoiceover(scriptLines) {
  const apiKey = requiredEnv("ELEVENLABS_API_KEY");
  const voiceId = await resolveElevenLabsVoiceId();
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: scriptLines.join(" "),
      model_id: elevenLabsModelId,
      language_code: "es",
      voice_settings: {
        stability: 0.42,
        similarity_boost: 0.82,
        style: 0.28,
        use_speaker_boost: true,
      },
    }),
  });
  if (!response.ok) throw new Error(`ElevenLabs TTS failed: ${response.status} ${await response.text()}`);
  await fs.writeFile(voiceoverPath, Buffer.from(await response.arrayBuffer()));
}

function probeDurationSeconds(filePath) {
  const ffprobePath = path.join(projectRoot, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffprobe.exe");
  const output = execFileSync(
    ffprobePath,
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
    { encoding: "utf8" }
  );
  return Number.parseFloat(output.trim());
}

function buildCaptions(scriptLines, audioDurationSeconds) {
  const usableSeconds = Math.min(Math.max(audioDurationSeconds + 0.5, 12), 18);
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
  const scriptLines = buildVoiceoverScript(candidate, angle);
  await generateVoiceover(scriptLines);
  const captions = buildCaptions(scriptLines, probeDurationSeconds(voiceoverPath));

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
    voiceoverSrc: "generated/videos/top-viral-story-voiceover.mp3",
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

  await writeJson(path.join(generatedDir, "top-viral-story-selection.json"), {
    market,
    selectedTrend: candidate,
    elevenLabsVoiceName,
    voiceoverPath,
    outputPath,
  });
  console.log(`Generated: ${outputPath}`);
  console.log(`ElevenLabs voice: ${elevenLabsVoiceName}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});