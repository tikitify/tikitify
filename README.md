# Tikitify

Discover the latest viral TikTok trends in one place.

## Daily social video

Tikitify can generate one vertical viral storytelling video for TikTok and Instagram Reels:

- `top1.mp4`, then `top2.mp4`, `top3.mp4`, etc.

The generator first checks each candidate trend for a downloadable direct MP4 in `video_url`. If the first one fails, it skips to the next trend until it finds one that can actually be downloaded. It does not use the TikTok embed as the background video source.

### Required environment variables

Keep real secrets in `.env.local` or your deployment secret store. Do not commit them.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Optional settings:

```bash
TIKITIFY_VIDEO_MARKET=global # global or spain
```

The generator does not create narration audio. It renders the story as burned-in Spanish subtitles over the video.

For visual script generation, install Ollama locally and pull Qwen2.5-VL or another vision model:

```bash
ollama pull qwen2.5vl:latest
```

The generator extracts 4 frames distributed across the video, resized to a maximum of 500px, sends them to Ollama, logs the detailed `visualSummary`, and then writes the subtitles from that visual analysis. Hashtags and metadata are only used as support when visual confidence is low. If the 4-frame Ollama request fails, the generator retries once with 2 frames before aborting.

If Ollama is not running or the configured vision model is unavailable, the generator stops and prints the Ollama error instead of falling back silently.

### Background music

The current format does not require extra background music. If you later want to add it, keep the file here:

```text
public/generated/music/background.mp3
```

### Run the generator

```bash
npm run generate:top-video
```

Generated files are saved here:

```text
public/generated/videos/
```


### Background video source

The generator uses `video_url` from Supabase as the background video source. In the import pipeline this field is filled from Apify data such as `video.url`, `videoUrl`, `videoMeta.downloadAddr`, or `videoMeta.playAddr` when available.

If a candidate `video_url` fails to download, the generator skips it and tries the next trend in the list.

### Avatar system

The current video does not use an avatar overlay.

### Outro asset

The final outro uses:

```text
public/audio.mp3
public/logo.png
```
