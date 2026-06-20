import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { CaptionCue, TopViralStoryProps } from "./types";

const colors = {
  bg: "#05070a",
  text: "#f5f7fb",
  muted: "#a8afbb",
  lime: "#c4ff3a",
  panel: "rgba(8, 11, 16, 0.56)",
  line: "rgba(255,255,255,0.16)",
};

function compactNumber(value?: number | null) {
  if (!value) return "-";
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}B`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

function safeText(value: string, max = 90) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}...`;
}

function extractHighlights(text: string) {
  return text.split(/(\b\d+(?:\.\d+)?[MKB]?\b|TikTok|viral|views?|likes?|#\w+|@\w+)/gi);
}

function HighlightedText({ text }: { text: string }) {
  return (
    <>
      {extractHighlights(text).map((part, index) => {
        const isKey =
          /^(?:\d+(?:\.\d+)?[MKB]?|TikTok|viral|views?|likes?|#\w+|@\w+)$/i.test(
            part
          );

        return (
          <span
            key={`${part}-${index}`}
            style={{ color: isKey ? colors.lime : colors.text }}
          >
            {part}
          </span>
        );
      })}
    </>
  );
}

function CaptionLayer({
  cues,
  storyDurationInFrames,
}: {
  cues: CaptionCue[];
  storyDurationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const cue =
    cues.find((item) => frame >= item.startFrame && frame < item.endFrame) ||
    cues[cues.length - 1];

  if (!cue) return null;

  const progress = interpolate(frame, [cue.startFrame, cue.startFrame + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        bottom: 340,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        opacity: progress,
        transform: `translateY(${interpolate(progress, [0, 1], [18, 0])}px)`,
      }}
    >
      <div
        style={{
          maxWidth: 900,
          textAlign: "center",
          color: colors.text,
          fontSize: 58,
          lineHeight: 1.06,
          fontWeight: 900,
          textShadow: "0 4px 28px rgba(0,0,0,0.95)",
          letterSpacing: 0,
        }}
      >
        <HighlightedText text={safeText(cue.text, 120)} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: -18,
          height: 4,
          background: "rgba(255,255,255,0.14)",
          borderRadius: 999,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${(frame / storyDurationInFrames) * 100}%`,
            background: colors.lime,
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
}

function Watermark() {
  return (
    <div
      style={{
        position: "absolute",
        left: 50,
        bottom: 52,
        color: "rgba(255,255,255,0.86)",
        fontSize: 68,
        fontWeight: 800,
        letterSpacing: 0,
        textShadow: "0 2px 14px rgba(0,0,0,0.9)",
      }}
    >
      tikitify.com
    </div>
  );
}
function StoryScene({
  trend,
  storyAngleTopic,
  storyAngleAction,
  backgroundVideoSrc,
  voiceoverSrc,
  captions,
  storyDurationInFrames,
}: Pick<
  TopViralStoryProps,
  "trend" | "storyAngleTopic" | "storyAngleAction" | "backgroundVideoSrc" | "voiceoverSrc" | "captions" | "storyDurationInFrames"
>) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bgScale = interpolate(frame, [0, storyDurationInFrames], [1.02, 1.08]);
  const drift = Math.sin(frame / 22) * 10;
  const titleProgress = spring({
    frame,
    fps,
    config: { damping: 18, mass: 0.8 },
  });

  return (
    <>
      <OffthreadVideo
        src={staticFile(backgroundVideoSrc)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${bgScale}) translateY(${drift}px)`,
        }}
        muted
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.20), rgba(0,0,0,0.48) 34%, rgba(0,0,0,0.62))",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 56,
          right: 120,
          top: 72,
          color: colors.text,
          fontSize: 28,
          fontWeight: 800,
          opacity: interpolate(titleProgress, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(titleProgress, [0, 1], [14, 0])}px)`,
        }}
      >
        historia viral
      </div>
      <div
        style={{
          position: "absolute",
          left: 56,
          right: 120,
          top: 126,
          color: colors.text,
          fontSize: 84,
          lineHeight: 0.96,
          fontWeight: 950,
          textShadow: "0 4px 30px rgba(0,0,0,0.85)",
        }}
      >
        Lo que está pasando ahora
      </div>
      <div
        style={{
          position: "absolute",
          left: 58,
          top: 334,
          maxWidth: 720,
          color: colors.muted,
          fontSize: 68,
          lineHeight: 1.18,
          fontWeight: 650,
          textShadow: "0 2px 16px rgba(0,0,0,0.8)",
        }}
      >
        {`Se ve ${storyAngleAction}.`}
      </div>
      <div
        style={{
          position: "absolute",
          left: 58,
          bottom: 148,
          color: colors.text,
          fontSize: 48,
          lineHeight: 1.04,
          fontWeight: 900,
          maxWidth: 760,
          textShadow: "0 4px 18px rgba(0,0,0,0.9)",
        }}
      >
        {trend.views ? `${compactNumber(trend.views)} visualizaciones y subiendo.` : "La cosa no para."}
      </div>
      <div
        style={{
          position: "absolute",
          left: 58,
          top: 388,
          maxWidth: 720,
          color: colors.muted,
          fontSize: 32,
          lineHeight: 1.18,
          fontWeight: 600,
          textShadow: "0 2px 16px rgba(0,0,0,0.8)",
        }}
      >
        {`Un vídeo de ${storyAngleTopic} que no deja de crecer.`}
      </div>
      <Audio src={staticFile(voiceoverSrc)} volume={1} />
      <CaptionLayer cues={captions} storyDurationInFrames={storyDurationInFrames} />

      <Watermark />
    </>
  );
}

function OutroScene({ outroAudioSrc }: { outroAudioSrc: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    frame,
    fps,
    config: { damping: 18, mass: 0.8 },
  });
  const scale = interpolate(progress, [0, 1], [0.95, 1]);

  return (
    <>
      <AbsoluteFill style={{ backgroundColor: colors.bg }} />
      <Audio src={staticFile(outroAudioSrc)} volume={1} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Img
          src={staticFile("logo.png")}
          style={{
            width: 360,
            height: 360,
            objectFit: "contain",
            transform: `scale(${scale})`,
            opacity: progress,
          }}
        />
      </div>
    </>
  );
}

export function TopViralStory(props: TopViralStoryProps) {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      {frame < props.storyDurationInFrames ? (
        <StoryScene
          trend={props.trend}
          storyAngleTopic={props.storyAngleTopic}
          storyAngleAction={props.storyAngleAction}
          backgroundVideoSrc={props.backgroundVideoSrc}
          voiceoverSrc={props.voiceoverSrc}
          captions={props.captions}
          storyDurationInFrames={props.storyDurationInFrames}
        />
      ) : (
        <Sequence from={props.storyDurationInFrames}>
          <OutroScene outroAudioSrc={props.outroAudioSrc} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
}






