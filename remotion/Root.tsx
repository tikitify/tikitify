import { Composition } from "remotion";
import { TopViralStory } from "./TopViralStory";

const fps = 30;
const storyDurationInFrames = 540;
const outroDurationInFrames = 120;

export const TikitifyRoot = () => {
  return (
    <Composition
      id="TopViralStory"
      component={TopViralStory}
      durationInFrames={storyDurationInFrames + outroDurationInFrames}
      fps={fps}
      width={1080}
      height={1920}
      defaultProps={{
        trend: {
          apify_id: "sample",
          position: 1,
          market: "global",
          title: "Un vídeo viral",
          audio: "Sonido original",
          hashtags: "#viral #tiktok",
          image_url: null,
          video_url: null,
          views: 1000000,
          likes: 100000,
          tiktok_url: null,
          author_username: "tikitify",
        },
        storyAngleTopic: "vídeos virales",
        storyAngleAction: "un clip corto que engancha desde el primer segundo",
        backgroundVideoSrc: "generated/videos/background-source.mp4",
        voiceoverSrc: "generated/videos/top-viral-story-voiceover.mp3",
        outroAudioSrc: "audio.mp3",
        captions: [
          { startFrame: 0, endFrame: 130, text: "Este vídeo está arrasando en TikTok." },
          { startFrame: 130, endFrame: 255, text: "Se ve un clip corto que engancha desde el primer segundo." },
          { startFrame: 255, endFrame: 390, text: "Ya suma millones de visualizaciones y me gusta." },
          { startFrame: 390, endFrame: 540, text: "Encuentra los vídeos más virales en Tikitify." },
        ],
        storyDurationInFrames,
        outroDurationInFrames,
      }}
    />
  );
};
