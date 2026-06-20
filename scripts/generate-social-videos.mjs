import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env") });

const outputDir = path.join(projectRoot, "public", "generated", "videos");
const musicPath = path.join(projectRoot, "public", "generated", "music", "background.mp3");
const snapshotPath = path.join(outputDir, "trend-rank-snapshot.json");
const remotionEntry = path.join(projectRoot, "remotion", "index.tsx");

const videoMarket = normalizeMarket(process.env.TIKITIFY_VIDEO_MARKET || "global");
const ttsProvider = (process.env.TIKITIFY_TTS_PROVIDER || "openai").toLowerCase();
const openAiTtsModel = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const openAiTtsVoice = process.env.OPENAI_TTS_VOICE || "alloy";
const today = new Date();
const todayKey = today.toISOString().slice(0, 10);

const jobs = [
  {
    variant: "top-viral-story",
    compositionId: "TopViralStory",
    outputName: "top-viral-story.mp4",
    audioName: "top-viral-story.mp3",
  },
  {
    variant: "biggest-climber",
    compositionId: "BiggestClimber",
    outputName: "biggest-climber.mp4",
    audioName: "biggest-climber.mp3",
  },
  {
    variant: "top-5-trends",
    compositionId: "Top5Trends",
    outputName: "top-5-trends.mp4",
    audioName: "top-5-trends.mp3",
  },
];

function normalizeMarket(value) {
  return value === "spain" ? "spain" : "global";
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function compactNumber(value) {
  if (!value) return "-";
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}B`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

function spokenNumber(value) {
  if (!value) return "muchas";
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)} mil millones`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)} millones`;
  if (value >= 1000) return `${Math.round(value / 1000)} mil`;
  return String(value);
}

function firstHashtag(hashtags) {
  const match = hashtags?.match(/#[\p{L}\p{N}_]+/u);
  return match?.[0] || null;
}

function cleanText(value, fallback = "TikTok trend") {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

function trendLabel(trend) {
  return cleanText(
    trend.title ||
      firstHashtag(trend.hashtags) ||
      trend.audio ||
      (trend.author_username ? `@${trend.author_username}` : null),
    "TikTok trend"
  );
}

function toPublicPath(filePath) {
  return path
    .relative(path.join(projectRoot, "public"), filePath)
    .split(path.sep)
    .join("/");
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function createSupabase() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}

async function fetchCurrentTrends() {
  const supabase = createSupabase();

  const { data: currentRows, error: currentError } = await supabase
    .from("trends")
    .select("*")
    .order("market", { ascending: true })
    .order("position", { ascending: true });

  if (currentError) throw new Error(currentError.message);
  if (!currentRows?.length) throw new Error("No trends found in Supabase.");

  const poolIds = currentRows.flatMap((row) => [
    String(row.apify_id),
    `${row.market}_${row.apify_id}`,
  ]);

  const { data: poolRows, error: poolError } = await supabase
    .from("trend_pool")
    .select("*")
    .in("apify_id", Array.from(new Set(poolIds)));

  if (poolError) {
    console.warn(`Could not enrich trends from trend_pool: ${poolError.message}`);
  }

  const poolById = new Map();
  for (const row of poolRows || []) {
    poolById.set(String(row.apify_id), row);
    poolById.set(String(row.apify_id).replace(/^(global|spain)_/, ""), row);
  }

  return currentRows
    .map((row, index) => {
      const market = normalizeMarket(row.market);
      const enriched =
        poolById.get(`${market}_${row.apify_id}`) ||
        poolById.get(String(row.apify_id)) ||
        {};

      const merged = { ...enriched, ...row };
      const position =
        typeof merged.position === "number" ? merged.position : index + 1;

      return {
        apifyId: String(merged.apify_id || row.apify_id),
        position,
        market,
        label: trendLabel(merged),
        title: merged.title || null,
        audio: merged.audio || null,
        hashtags: merged.hashtags || null,
        imageUrl: merged.image_url || null,
        views: typeof merged.views === "number" ? merged.views : null,
        likes: typeof merged.likes === "number" ? merged.likes : null,
        authorUsername: merged.author_username || null,
      };
    })
    .sort((a, b) => a.position - b.position);
}

async function readSnapshot() {
  try {
    const raw = await fs.readFile(snapshotPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.snapshots) ? parsed.snapshots : [];
  } catch {
    return [];
  }
}

async function writeSnapshot(market, trends) {
  const snapshots = await readSnapshot();
  const nextSnapshot = {
    date: todayKey,
    market,
    ranks: trends.map((trend) => ({
      apifyId: trend.apifyId,
      position: trend.position,
      label: trend.label,
    })),
  };

  const filtered = snapshots.filter(
    (snapshot) => !(snapshot.date === todayKey && snapshot.market === market)
  );

  await fs.writeFile(
    snapshotPath,
    JSON.stringify({ snapshots: [...filtered, nextSnapshot].slice(-45) }, null, 2)
  );
}

function getPreviousSnapshot(snapshots, market) {
  return snapshots
    .filter((snapshot) => snapshot.market === market && snapshot.date < todayKey)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

function findBiggestClimber(currentTrends, previousSnapshot) {
  const previousRanks = new Map(
    previousSnapshot?.ranks?.map((rank) => [rank.apifyId, rank.position]) || []
  );

  const candidates = currentTrends.map((trend) => {
    const previousPosition = previousRanks.get(trend.apifyId);
    const positionsGained =
      typeof previousPosition === "number"
        ? Math.max(previousPosition - trend.position, 0)
        : 0;

    return {
      ...trend,
      previousPosition: previousPosition || null,
      positionsGained,
    };
  });

  candidates.sort((a, b) => {
    if ((b.positionsGained || 0) !== (a.positionsGained || 0)) {
      return (b.positionsGained || 0) - (a.positionsGained || 0);
    }

    return a.position - b.position;
  });

  return candidates[0];
}

function getDateLabel() {
  return new Intl.DateTimeFormat("es", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(today);
}

function buildTopViralStory(trends, audioSrc, musicSrc) {
  const trend = trends[0];
  const label = trend.label;
  const scriptLines = [
    "Hay un video que hoy le robo la atencion a TikTok.",
    `No es ruido: ya suma ${spokenNumber(trend.views)} visualizaciones.`,
    `Ahora mismo esta en el puesto numero ${trend.position}.`,
    "Cuando una pieza sube asi, suele arrastrar audios, hashtags y copias.",
    "Go viral. Tikitify.",
  ];
  const scenes = [
    {
      kicker: "ALGO PASO HOY",
      text: "Un video acaba de robarle la atencion a TikTok.",
      detail: label,
      accent: "lime",
    },
    {
      kicker: "EL DATO",
      text: `${compactNumber(trend.views)} visualizaciones no son casualidad.`,
      detail: trend.likes
        ? `Tambien suma ${compactNumber(trend.likes)} likes.`
        : "La senal esta en la velocidad.",
      accent: "cyan",
    },
    {
      kicker: "POR QUE IMPORTA",
      text: "Cuando esto sube, otros creadores empiezan a copiarlo.",
      detail: trend.audio || trend.hashtags || "Audio, formato y tema se mueven juntos.",
      accent: "coral",
    },
    {
      kicker: "LA JUGADA",
      text: "Si vas a publicar hoy, mira esta senal antes que el resto.",
      detail: "Tikitify convierte tendencias en ideas accionables.",
      accent: "lime",
    },
  ];

  return {
    variant: "top-viral-story",
    dateLabel: getDateLabel(),
    title: "Historia viral",
    subtitle: label,
    hook: "Un video acaba de robarle la atencion a TikTok.",
    metricLabel: "Views",
    metricValue: compactNumber(trend.views),
    secondaryMetricLabel: "Likes",
    secondaryMetricValue: compactNumber(trend.likes),
    scenes,
    scriptLines,
    featuredTrend: trend,
    trends: [trend],
    voiceoverSrc: audioSrc,
    backgroundMusicSrc: musicSrc,
  };
}

function buildBiggestClimber(climber, audioSrc, musicSrc) {
  const gained = climber.positionsGained || 0;
  const hasPrevious = typeof climber.previousPosition === "number";
  const hook =
    gained > 0
      ? `Esta tendencia salto ${gained} puestos en 24 horas.`
      : "Esta tendencia acaba de entrar en radar.";
  const scriptLines = hasPrevious
    ? [
        hook,
        `Ayer estaba en el numero ${climber.previousPosition}.`,
        `Hoy esta en el numero ${climber.position}.`,
        `Ya suma ${spokenNumber(climber.views)} visualizaciones.`,
        "Go viral. Tikitify.",
      ]
    : [
        "Esta tendencia acaba de entrar en el radar de TikTok.",
        `Hoy esta en el numero ${climber.position}.`,
        `Ya tiene ${spokenNumber(climber.views)} visualizaciones.`,
        "Go viral. Tikitify.",
      ];
  const scenes = hasPrevious
    ? [
        {
          kicker: "SUBIDA BRUTAL",
          text: `Salto ${gained} puestos en 24 horas.`,
          detail: `Ayer #${climber.previousPosition}. Hoy #${climber.position}.`,
          accent: "coral",
        },
        {
          kicker: "LA PRUEBA",
          text: `${compactNumber(climber.views)} visualizaciones y subiendo.`,
          detail: climber.label,
          accent: "cyan",
        },
        {
          kicker: "LA SENAL",
          text: "TikTok no solo premia tamano. Premia velocidad.",
          detail: "Cuando algo escala rapido, merece una mirada.",
          accent: "lime",
        },
        {
          kicker: "PARA CREADORES",
          text: "Este es el tipo de ola que puedes aprovechar temprano.",
          detail: "Encuentrala antes de que sea obvia.",
          accent: "coral",
        },
      ]
    : [
        {
          kicker: "NUEVA SENAL",
          text: "Esta tendencia acaba de entrar en radar.",
          detail: climber.label,
          accent: "coral",
        },
        {
          kicker: "EL DATO",
          text: `Ya tiene ${compactNumber(climber.views)} visualizaciones.`,
          detail: `Hoy esta en el puesto #${climber.position}.`,
          accent: "cyan",
        },
        {
          kicker: "LO INTERESANTE",
          text: "Todavia no sabemos si sera gigante. Pero ya se esta moviendo.",
          detail: "Ese momento temprano es donde aparecen las oportunidades.",
          accent: "lime",
        },
      ];

  return {
    variant: "biggest-climber",
    dateLabel: getDateLabel(),
    title: "Mayor subida",
    subtitle: climber.label,
    hook,
    metricLabel: gained > 0 ? "Jump" : "Rank",
    metricValue: gained > 0 ? `+${gained}` : `#${climber.position}`,
    secondaryMetricLabel: "Views",
    secondaryMetricValue: compactNumber(climber.views),
    scenes,
    scriptLines,
    featuredTrend: climber,
    trends: [climber],
    voiceoverSrc: audioSrc,
    backgroundMusicSrc: musicSrc,
  };
}

function buildTopFive(trends, audioSrc, musicSrc) {
  const topFive = trends.slice(0, 5);
  const scriptLines = [
    "Si vas a publicar hoy, no empieces a ciegas.",
    "Estas son las cinco senales que TikTok esta empujando ahora.",
    ...topFive.map(
      (trend) =>
        `Numero ${trend.position}: ${trend.label}, con ${spokenNumber(
          trend.views
        )} visualizaciones.`
    ),
    "Go viral. Tikitify.",
  ];
  const scenes = [
    {
      kicker: "NO PUBLIQUES A CIEGAS",
      text: "Estas son las 5 senales que TikTok esta empujando hoy.",
      detail: "Usalas para elegir tema, audio o formato.",
      accent: "lime",
    },
  ];

  return {
    variant: "top-5-trends",
    dateLabel: getDateLabel(),
    title: "Top 5 tendencias",
    subtitle: `${videoMarket} TikTok trend radar`,
    hook: "No publiques a ciegas.",
    scenes,
    scriptLines,
    featuredTrend: topFive[0] || null,
    trends: topFive,
    voiceoverSrc: audioSrc,
    backgroundMusicSrc: musicSrc,
  };
}

async function generateVoiceover(outputPath, scriptLines) {
  if (ttsProvider === "none") {
    console.warn("Skipping voiceover because TIKITIFY_TTS_PROVIDER=none.");
    return null;
  }

  if (ttsProvider !== "openai") {
    throw new Error(`Unsupported TTS provider: ${ttsProvider}`);
  }

  const apiKey = requiredEnv("OPENAI_API_KEY");
  const input = scriptLines.join(" ");
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openAiTtsModel,
      voice: openAiTtsVoice,
      input,
      format: "mp3",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI TTS failed: ${response.status} ${body}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, audioBuffer);
  return toPublicPath(outputPath);
}

async function cacheThumbnail(trend, slug) {
  if (!trend?.imageUrl) return trend;

  try {
    const response = await fetch(trend.imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const contentType = response.headers.get("content-type") || "";

    if (!response.ok || !contentType.startsWith("image/")) {
      return { ...trend, imageUrl: null };
    }

    const extension = contentType.includes("png") ? "png" : "jpg";
    const outputPath = path.join(outputDir, `${slug}-thumbnail.${extension}`);
    const imageBuffer = Buffer.from(await response.arrayBuffer());

    await fs.writeFile(outputPath, imageBuffer);
    return { ...trend, imageUrl: toPublicPath(outputPath) };
  } catch (error) {
    console.warn(`Could not cache thumbnail for ${slug}: ${error.message}`);
    return { ...trend, imageUrl: null };
  }
}

async function renderVideo(bundleLocation, job, inputProps) {
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: job.compositionId,
    inputProps,
  });

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    audioCodec: "aac",
    inputProps,
    outputLocation: path.join(outputDir, job.outputName),
  });
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const allTrends = await fetchCurrentTrends();
  const marketTrends = allTrends.filter((trend) => trend.market === videoMarket);
  const selectedTrends = marketTrends.length >= 5 ? marketTrends : allTrends;

  if (!selectedTrends.length) {
    throw new Error(`No usable trends found for market: ${videoMarket}`);
  }

  const previousSnapshot = getPreviousSnapshot(await readSnapshot(), videoMarket);
  const biggestClimber = findBiggestClimber(selectedTrends, previousSnapshot);
  const topTrendWithThumbnail = await cacheThumbnail(
    selectedTrends[0],
    "top-viral-story"
  );
  const climberWithThumbnail = await cacheThumbnail(
    biggestClimber,
    "biggest-climber"
  );
  const backgroundMusicSrc = (await pathExists(musicPath))
    ? toPublicPath(musicPath)
    : null;

  const draftPropsByVariant = {
    "top-viral-story": buildTopViralStory(
      [topTrendWithThumbnail, ...selectedTrends.slice(1)],
      null,
      backgroundMusicSrc
    ),
    "biggest-climber": buildBiggestClimber(
      climberWithThumbnail,
      null,
      backgroundMusicSrc
    ),
    "top-5-trends": buildTopFive(selectedTrends, null, backgroundMusicSrc),
  };

  const propsByVariant = {};

  for (const job of jobs) {
    const audioOutputPath = path.join(outputDir, job.audioName);
    const voiceoverSrc = await generateVoiceover(
      audioOutputPath,
      draftPropsByVariant[job.variant].scriptLines
    );

    propsByVariant[job.variant] = {
      ...draftPropsByVariant[job.variant],
      voiceoverSrc,
    };
  }

  const bundleLocation = await bundle({
    entryPoint: remotionEntry,
  });

  for (const job of jobs) {
    await renderVideo(bundleLocation, job, propsByVariant[job.variant]);
  }

  await writeSnapshot(videoMarket, selectedTrends);

  console.log("Generated Tikitify social videos:");
  for (const job of jobs) {
    console.log(`- ${path.join(outputDir, job.outputName)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
