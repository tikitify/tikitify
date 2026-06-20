# Tikitify

Discover the latest viral TikTok trends in one place.

## Daily social video

Tikitify can generate one vertical viral storytelling video for TikTok and Instagram Reels:

- `top-viral-story.mp4`

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
TIKITIFY_TTS_PROVIDER=elevenlabs # elevenlabs, openai, windows-sapi, or none
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
OPENAI_API_KEY=
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=alloy
```

If `ELEVENLABS_API_KEY` is present, the generator will use ElevenLabs first. If not, it falls back to OpenAI when available, and then to the Windows system voice on this machine.

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

Audio files are saved next to the videos:

```text
public/generated/videos/top-viral-story.mp3
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
