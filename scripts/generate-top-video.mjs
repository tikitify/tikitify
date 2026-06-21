import { bundle } from "@remotion/bundler";
import { getVideoMetadata, renderMedia, selectComposition } from "@remotion/renderer";
import { createClient } from "@supabase/supabase-js";
import ytDlpWrapModule from "yt-dlp-wrap";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const YTDlpWrap = ytDlpWrapModule.default || ytDlpWrapModule;
const execFileAsync = promisify(execFile);

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
const ffmpegPath = path.join(projectRoot, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffmpeg.exe");
const ollamaVisionModel = process.env.OLLAMA_VISION_MODEL || "qwen2.5vl:latest";
const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const ollamaNumCtx = Number.parseInt(process.env.OLLAMA_NUM_CTX || "32768", 10);
const ollamaTimeoutMs = Number.parseInt(process.env.OLLAMA_TIMEOUT_MS || "900000", 10);

const market = normalizeMarket(process.env.TIKITIFY_VIDEO_MARKET || "global");
const targetInput = process.argv.find((arg) => arg.includes("tikitify.com/video/") || /^\d{12,}$/.test(arg)) || process.env.TIKITIFY_VIDEO_TARGET || "";
const targetVideoId = extractVideoId(targetInput);
const stopBeforeRender = process.env.TIKITIFY_STOP_BEFORE_RENDER === "1";

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


function normalizeAccent(text) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function splitHashtags(value) {
  return String(value || "")
    .match(/#[\p{L}\p{N}_]+/gu)?.map((tag) => tag.slice(1)) || [];
}

function cleanLabel(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function inferStoryAngle(trend) {
  const tags = splitHashtags(trend.hashtags);
  const source = normalizeAccent(
    [trend.title, trend.description, trend.audio, trend.hashtags, trend.author_username].filter(Boolean).join(" ")
  );

  const patterns = [
    { keywords: ["futbol", "football", "soccer", "goal", "gol", "mundial", "champions", "tiktokfootballacademy"], topic: "deporte", subject: "futbol", action: "un momento de futbol pensado para provocar reaccion" },
    { keywords: ["news", "noticia", "daily", "celebrity", "famoso", "olivertree", "politica", "breaking"], topic: "noticia", subject: "actualidad y famosos", action: "un tema de actualidad convertido en clip rapido" },
    { keywords: ["humor", "meme", "comedia", "broma", "funny", "lol", "relatable"], topic: "humor", subject: "humor", action: "una situacion reconocible tratada como meme" },
    { keywords: ["baile", "dance", "dancing", "coreo", "tiktokdance", "trenddance"], topic: "baile", subject: "baile", action: "un gesto o coreografia facil de copiar" },
    { keywords: ["music", "song", "cover", "audio", "sound", "cantante", "rap", "pop"], topic: "musica", subject: "musica", action: "un sonido que manda mas que la imagen" },
    { keywords: ["maquillaje", "beauty", "makeup", "skincare", "belleza", "outfit", "grwm", "aesthetic"], topic: "estetica", subject: "estetica", action: "una transformacion visual o estilo muy compartible" },
    { keywords: ["cocina", "food", "recipe", "receta", "comida"], topic: "comida", subject: "comida", action: "una receta o plato que entra por los ojos" },
    { keywords: ["gaming", "juego", "gamer", "videogame", "fortnite", "roblox", "minecraft"], topic: "gaming", subject: "gaming", action: "un momento de partida que se entiende sin contexto" },
    { keywords: ["drama", "polemica", "conflict", "controversia", "exposed"], topic: "polemica", subject: "polemica", action: "una tension que invita a mirar comentarios" },
    { keywords: ["baby", "bebe", "child", "kid", "family", "familia"], topic: "familia", subject: "familia", action: "un momento cotidiano con reaccion inmediata" },
  ];

  const match = patterns.find((entry) => entry.keywords.some((keyword) => source.includes(keyword)));
  const primaryTag = tags.find((tag) => cleanLabel(tag).length > 2 && !/^fyp|fy|viral|parati|foryoupage$/i.test(tag));

  if (match) {
    return {
      ...match,
      tag: primaryTag ? cleanLabel(primaryTag) : null,
    };
  }

  return {
    topic: primaryTag ? cleanLabel(primaryTag) : "video viral",
    subject: primaryTag ? cleanLabel(primaryTag) : "un tema que TikTok esta empujando",
    action: primaryTag ? `contenido alrededor de ${cleanLabel(primaryTag)}` : "un clip corto que busca reaccion rapida",
    tag: primaryTag ? cleanLabel(primaryTag) : null,
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
  const requestedOutputName = process.env.TIKITIFY_OUTPUT_NAME;
  if (requestedOutputName) {
    if (!/^top\d+\.mp4$/i.test(requestedOutputName)) {
      throw new Error("TIKITIFY_OUTPUT_NAME must look like top8.mp4.");
    }
    return {
      outputName: requestedOutputName,
      outputPath: path.join(generatedDir, requestedOutputName),
    };
  }

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
async function readUsedTrendIds() {
  if (targetVideoId) return new Set();
  const files = await fs.readdir(generatedDir).catch(() => []);
  const selectionFiles = files.filter((file) => /^top\d+-selection\.json$/i.test(file));
  const used = new Set();

  for (const file of selectionFiles) {
    try {
      const raw = await fs.readFile(path.join(generatedDir, file), "utf8");
      const selection = JSON.parse(raw);
      const id = selection?.selectedTrend?.apify_id;
      if (id) used.add(String(id));
    } catch (error) {
      console.warn(`Could not read ${file}: ${error.message}`);
    }
  }

  return used;
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
    shares: typeof row.shares === "number" ? row.shares : null,
    comments: typeof row.comments === "number" ? row.comments : null,
    description: row.description || row.caption || row.text || row.desc || null,
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
      const metadata = await getVideoMetadata(tempPath);
      await fs.rename(tempPath, backgroundSourcePath);
      return { candidate, metadata };
    } catch (error) {
      console.warn(`Skipping ${candidate.apify_id} because the MP4 could not be downloaded: ${error.message}`);
      await fs.rm(`${backgroundSourcePath}.candidate-${index}.mp4`, { force: true });
    }
  }
  throw new Error("No downloadable MP4 source was found.");
}

function formatTimestamp(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${secs.toFixed(3).padStart(6, "0")}`;
}

function analysisFrameTimes(duration, count) {
  const safeEnd = Math.max(duration - 0.75, 0.35);
  if (count === 2) {
    return [
      Math.min(Math.max(duration / 3, 0.75), safeEnd),
      Math.min(Math.max((duration * 2) / 3, 0.75), safeEnd),
    ];
  }

  return [
    Math.min(0.75, safeEnd),
    Math.min(Math.max(duration / 3, 0.75), safeEnd),
    Math.min(Math.max((duration * 2) / 3, 0.75), safeEnd),
    safeEnd,
  ];
}

async function extractAnalysisFrames(videoPath, frameCount = 4) {
  const frameDir = path.join(generatedDir, "analysis-frames");
  await fs.rm(frameDir, { recursive: true, force: true });
  await fs.mkdir(frameDir, { recursive: true });

  const metadata = await getVideoMetadata(videoPath);
  const duration = Math.max(metadata.durationInSeconds || 0, 1);
  const times = analysisFrameTimes(duration, frameCount);
  const framePaths = [];

  for (const [index, seconds] of times.entries()) {
    const framePath = path.join(frameDir, `frame-${index + 1}.jpg`);
    try {
      await execFileAsync(ffmpegPath, [
        "-y",
        "-ss",
        formatTimestamp(seconds),
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-vf",
        "scale='if(gt(iw,ih),500,-2)':'if(gt(iw,ih),-2,500)'",
        "-q:v",
        "3",
        framePath,
      ]);
      framePaths.push(framePath);
    } catch (error) {
      console.warn(`Could not extract frame ${index + 1} at ${seconds.toFixed(2)}s: ${error.message}`);
    }
  }

  return framePaths;
}
async function imageFileToBase64(filePath) {
  const data = await fs.readFile(filePath);
  return data.toString("base64");
}

function parseVisualSummary(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    return {
      source: "vision",
      confidence: parsed.confidence || "medium",
      hook: cleanLabel(parsed.hook),
      opening: cleanLabel(parsed.opening),
      progression: cleanLabel(parsed.progression),
      transformation: cleanLabel(parsed.transformation),
      twist: cleanLabel(parsed.twist),
      retention: cleanLabel(parsed.retention),
      visualDetails: Array.isArray(parsed.visualDetails) ? parsed.visualDetails.map(cleanLabel).filter(Boolean).slice(0, 4) : [],
      reason: cleanLabel(parsed.reason || ""),
    };
  } catch {
    throw new Error(`Ollama vision response was not valid JSON: ${rawText.slice(0, 500)}`);
  }
}

async function postJsonWithLongTimeout(url, payload, timeoutMs) {
  const endpoint = new URL(url);
  const body = JSON.stringify(payload);
  const transport = endpoint.protocol === "https:" ? https : http;

  return await new Promise((resolve, reject) => {
    const request = transport.request(
      {
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: endpoint.port,
        path: `${endpoint.pathname}${endpoint.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        response.setEncoding("utf8");
        let responseBody = "";

        response.on("data", (chunk) => {
          responseBody += chunk;
        });

        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Ollama vision analysis failed: ${response.statusCode} ${responseBody}`));
            return;
          }

          try {
            resolve(JSON.parse(responseBody));
          } catch {
            reject(new Error(`Ollama response was not valid JSON: ${responseBody.slice(0, 500)}`));
          }
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Ollama vision analysis timed out after ${timeoutMs}ms at ${url}.`));
    });

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function requestOllamaVisualSummary(trend, angle, videoPath, frameCount) {
  const framePaths = await extractAnalysisFrames(videoPath, frameCount);
  if (framePaths.length !== frameCount) {
    throw new Error(`Expected ${frameCount} analysis frames, but only extracted ${framePaths.length}.`);
  }

  const images = await Promise.all(framePaths.map(imageFileToBase64));
  const context = {
    hashtags: trend.hashtags,
    audio: trend.audio,
    author_username: trend.author_username,
    views: trend.views,
    likes: trend.likes,
    shares: trend.shares,
    comments: trend.comments,
    description: trend.description || trend.title,
    tiktok_url: trend.tiktok_url,
    image_url: trend.image_url,
    inferred_topic: angle.topic,
  };

  const prompt = `Analiza ${frameCount} frames de un TikTok distribuidos por el video. Prioriza una descripcion visual clara con velocidad razonable.
Devuelve SOLO JSON valido en espanol con estas claves exactas:
{
  "confidence": "high|medium|low",
  "hook": "por que engancha visualmente",
  "opening": "que aparece al principio",
  "progression": "como avanza la accion entre frames",
  "transformation": "que cambia o se transforma visualmente",
  "twist": "que sorprende o rompe la expectativa",
  "retention": "por que alguien esperaria hasta el final",
  "visualDetails": ["detalle visual concreto 1", "detalle visual concreto 2"],
  "reason": "breve explicacion de tu confianza"
}
Reglas obligatorias:
- Describe acciones, objetos, gestos, cambios de escala, apariciones, movimientos o transformaciones visibles.
- No inventes personas, objetos, lugares ni acciones que no puedan deducirse de los frames.
- No uses frases genericas como mira este video, esta arrasando, muy bueno o se ha vuelto viral.
- Usa hashtags/audio/autor SOLO como apoyo si confidence es low o si los frames no dejan claro el contexto.
- Si confidence es low, di exactamente que no se puede saber visualmente y apoyate de forma prudente en estos datos: ${JSON.stringify(context)}`;

  console.log(`Analyzing ${images.length} frames with Ollama model ${ollamaVisionModel} (${ollamaNumCtx} ctx, timeout ${ollamaTimeoutMs}ms).`);

  try {
    const result = await postJsonWithLongTimeout(
      `${ollamaUrl.replace(/\/$/, "")}/api/generate`,
      {
        model: ollamaVisionModel,
        prompt,
        images,
        stream: false,
        format: "json",
        options: {
          temperature: 0.2,
          num_ctx: ollamaNumCtx,
        },
      },
      ollamaTimeoutMs,
    );
    return parseVisualSummary(result.response || "");
  } catch (error) {
    if (error.message?.startsWith("Ollama vision analysis failed")) throw error;
    const cause = error.cause ? ` Cause: ${JSON.stringify(error.cause)}` : "";
    throw new Error(`Ollama connection failed at ${ollamaUrl}: ${error.message}.${cause}`);
  }
}

async function generateVisualSummary(trend, angle, videoPath) {
  try {
    return await requestOllamaVisualSummary(trend, angle, videoPath, 4);
  } catch (firstError) {
    console.warn(`Ollama 4-frame analysis failed: ${firstError.message}`);
    console.warn("Retrying visual analysis with 2 frames.");
    try {
      return await requestOllamaVisualSummary(trend, angle, videoPath, 2);
    } catch (secondError) {
      throw new Error(`Ollama visual analysis failed with 4 frames and 2 frames. First error: ${firstError.message} Second error: ${secondError.message}`);
    }
  }
}
function sanitizeScriptLines(value) {
  const bannedPatterns = [
    /\bpresentador(?:a|es)?\b/gi,
    /\bestudio(?:s)?\b/gi,
    /\btelevisi[oó]n\b/gi,
    /\bmapa(?:s)?\b/gi,
    /\bfondo(?:s)?\b/gi,
    /\bdecorado(?:s)?\b/gi,
    /\breportaje(?:s)?\b/gi,
    /\beste v[ií]deo\b/gi,
    /\bel v[ií]deo\b/gi,
    /\bclip\b/gi,
  ];

  return (Array.isArray(value) ? value : [])
    .map((line) => cleanLabel(line))
    .map((line) => bannedPatterns.reduce((text, pattern) => text.replace(pattern, ""), line))
    .map((line) => line.replace(/\bun de noticias habla sobre una tradici[oó]n japonesa en la copa mundial\b/gi, "Una tradicion japonesa durante el Mundial esta llamando la atencion"))
    .map((line) => line.replace(/\bun de noticias habla sobre\b/gi, "Una escena muestra"))
    .map((line) => line.replace(/\bel estadio vac[ií]a\b/gi, "el estadio se vacia"))
    .map((line) => line.replace(/\bel estadio llena\b/gi, "el estadio se llena"))
    .map((line) => line.replace(/\best[aá] arrasando en TikTok\b/gi, "esta dando la vuelta al mundo"))
    .map((line) => line.replace(/\bse ha vuelto viral en redes sociales\b/gi, "esta haciendo que mucha gente comparta la escena"))
    .map((line) => line.replace(/[¡!]/g, "").replace(/\s+/g, " ").replace(/\s+([,.])/g, "$1").trim())
    .filter((line) => line.length > 12)
    .map((line) => {
      const words = line.split(/\s+/);
      return words.length > 40 ? `${words.slice(0, 40).join(" ")}.` : line;
    })
    .slice(0, 4);
}

async function generateStoryScript(trend, angle, visualSummary) {
  const context = {
    visualSummary,
    hashtags: trend.hashtags,
    audio: trend.audio,
    author_username: trend.author_username,
    views: trend.views,
    likes: trend.likes,
    shares: trend.shares,
    comments: trend.comments,
    description: trend.description || trend.title,
    inferred_topic: angle.topic,
  };

  const prompt = `Convierte este visualSummary en un guion de narrador para TikTok o YouTube Shorts.
Devuelve SOLO JSON valido con esta forma exacta:
{"script":["frase 1","frase 2","frase 3","frase 4"]}

Reglas obligatorias:
- Idioma: espanol de Espana, natural y directo.
- 3 o 4 frases cortas. Maximo 40 palabras por frase.
- Frase 1: gancho.
- Frase 2: que esta ocurriendo.
- Frase 3: sorpresa o detalle mas interesante.
- Frase 4: por que la gente se queda mirando o lo comparte.
- No describas frame por frame.
- No menciones que es un video, clip, reportaje, noticia, resumen o analisis.
- Nunca menciones elementos accesorios: presentadores, estudios de television, mapas, fondos o decorados.
- Extrae solo el hecho interesante, la accion principal, la sorpresa y el motivo de retencion.
- Prioriza curiosidad y storytelling sobre descripcion literal.
- No uses frases genericas como "mira esto", "es muy bueno", "esta arrasando" o "ha subido posiciones".
- No inventes detalles concretos que no esten en visualSummary, visualDetails, hashtags o descripcion.
- Si aparecen aficionados japoneses con bolsas en un estadio y el contexto habla de tradicion, puedes expresarlo como una conducta llamativa de respeto o limpieza si los datos lo apoyan.

Ejemplo de estilo:
{"script":["Lo que hicieron estos aficionados japoneses despues del partido esta dando la vuelta al mundo.","Cuando el estadio empezo a vaciarse, ellos no se fueron.","Se quedaron limpiando las gradas mientras el resto de aficionados abandonaba el recinto.","Y por eso millones de personas estan compartiendo estas imagenes."]}

Datos:
${JSON.stringify(context, null, 2)}`;

  const result = await postJsonWithLongTimeout(
    `${ollamaUrl.replace(/\/$/, "")}/api/generate`,
    {
      model: ollamaVisionModel,
      prompt,
      stream: false,
      format: "json",
      options: {
        temperature: 0.35,
        num_ctx: ollamaNumCtx,
      },
    },
    ollamaTimeoutMs,
  );

  try {
    const parsed = JSON.parse(result.response || "");
    const script = sanitizeScriptLines(parsed.script);
    if (script.length >= 3) return script;
    throw new Error(`Ollama script response did not contain at least 3 usable lines: ${result.response}`);
  } catch (error) {
    throw new Error(`Ollama script generation failed: ${error.message}`);
  }
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
  const usedTrendIds = await readUsedTrendIds();
  const candidates = (await fetchCandidates()).filter((candidate) => !usedTrendIds.has(candidate.apify_id));
  if (!candidates.length) throw new Error(`No unused candidate trends found for market "${market}".`);

  const { candidate, metadata: backgroundMetadata } = await findDownloadableBackground(candidates);
  const angle = inferStoryAngle(candidate);
  const visualSummary = await generateVisualSummary(candidate, angle, backgroundSourcePath);
  console.log("Visual summary:");
  console.log(JSON.stringify(visualSummary, null, 2));
  const scriptLines = await generateStoryScript(candidate, angle, visualSummary);
  console.log("Generated script:");
  console.log(JSON.stringify(scriptLines, null, 2));
  if (stopBeforeRender) {
    console.log("Stopped before render because TIKITIFY_STOP_BEFORE_RENDER=1.");
    return;
  }
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
      shares: candidate.shares,
      comments: candidate.comments,
      description: candidate.description,
      tiktok_url: candidate.tiktok_url,
      author_username: candidate.author_username,
    },
    storyAngleTopic: angle.topic,
    storyAngleAction: angle.action,
    backgroundVideoSrc: "generated/videos/background-source.mp4",
    backgroundVideoDurationInFrames: Math.max(1, Math.floor((backgroundMetadata.durationInSeconds || 1) * fps)),
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
    skippedTrendIds: [...usedTrendIds],
    selectedTrend: candidate,
    visualSummary,
    scriptLines,
    outputPath,
  });
  console.log(`Generated: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
