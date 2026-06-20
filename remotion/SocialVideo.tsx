import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { SocialScene, SocialTrend, SocialVideoProps } from "./types";

const colors = {
  bg: "#07090d",
  text: "#f7f8fb",
  muted: "#a7adb8",
  lime: "#b7ff4a",
  coral: "#ff6b5f",
  cyan: "#59d8ff",
  line: "rgba(255, 255, 255, 0.16)",
  panel: "rgba(8, 11, 17, 0.74)",
};

function compactNumber(value?: number | null) {
  if (!value) return "-";
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}B`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

function safeText(value: string, max = 76) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}...`;
}

function appear(frame: number, start: number, duration = 14) {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function accentColor(scene?: SocialScene) {
  if (scene?.accent === "coral") return colors.coral;
  if (scene?.accent === "cyan") return colors.cyan;
  return colors.lime;
}

function imageSrc(src?: string | null) {
  if (!src) return null;
  return /^https?:\/\//.test(src) ? src : staticFile(src);
}

function Background() {
  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 22%, rgba(255,255,255,0.03))",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 48,
          border: `1px solid ${colors.line}`,
          borderRadius: 8,
        }}
      />
      {Array.from({ length: 18 }).map((_, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: 48,
            right: 48,
            top: 170 + index * 84,
            height: 1,
            background: "rgba(255,255,255,0.035)",
          }}
        />
      ))}
    </AbsoluteFill>
  );
}

function Header({ dateLabel }: { dateLabel: string }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 72,
        left: 72,
        right: 72,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        color: colors.muted,
        fontSize: 28,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <Img
          src={staticFile("logo.png")}
          style={{ width: 58, height: 58, objectFit: "contain" }}
        />
        <span style={{ color: colors.text, fontWeight: 780 }}>Tikitify</span>
      </div>
      <div>{dateLabel}</div>
    </div>
  );
}

function TrendVisual({ trend }: { trend?: SocialTrend | null }) {
  const src = imageSrc(trend?.imageUrl);

  return (
    <div
      style={{
        width: 322,
        height: 430,
        borderRadius: 8,
        overflow: "hidden",
        border: `1px solid ${colors.line}`,
        background: "rgba(255,255,255,0.07)",
        flexShrink: 0,
        position: "relative",
      }}
    >
      {src ? (
        <Img
          src={src}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: colors.muted,
            fontSize: 26,
            textAlign: "center",
            padding: 32,
            lineHeight: 1.2,
          }}
        >
          TIKITIFY
          <br />
          SIGNAL
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 18,
          bottom: 18,
          right: 18,
          color: colors.text,
          fontSize: 30,
          lineHeight: 1.08,
          fontWeight: 800,
          textShadow: "0 2px 16px rgba(0,0,0,0.8)",
        }}
      >
        #{trend?.position || 1}
      </div>
    </div>
  );
}

function MetricStrip({ trend }: { trend?: SocialTrend | null }) {
  const items = [
    ["rank", `#${trend?.position || 1}`],
    ["views", compactNumber(trend?.views)],
    ["likes", compactNumber(trend?.likes)],
  ];

  return (
    <div
      style={{
        position: "absolute",
        left: 72,
        right: 72,
        bottom: 194,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 14,
      }}
    >
      {items.map(([label, value], index) => (
        <div
          key={label}
          style={{
            border: `1px solid ${colors.line}`,
            borderRadius: 8,
            padding: "22px 24px",
            background: colors.panel,
          }}
        >
          <div
            style={{
              color: colors.muted,
              fontSize: 24,
              textTransform: "uppercase",
            }}
          >
            {label}
          </div>
          <div
            style={{
              color: index === 1 ? colors.lime : colors.text,
              fontSize: 54,
              fontWeight: 850,
              marginTop: 6,
            }}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function StoryScene({ props }: { props: SocialVideoProps }) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const scenes = props.scenes.length
    ? props.scenes
    : [{ kicker: props.title, text: props.hook, detail: props.subtitle }];
  const firstFrame = 42;
  const finalStart = durationInFrames - 132;
  const sceneLength = Math.max(
    1,
    Math.floor((finalStart - firstFrame) / scenes.length)
  );
  const activeIndex = Math.min(
    scenes.length - 1,
    Math.max(0, Math.floor((frame - firstFrame) / sceneLength))
  );
  const scene = scenes[activeIndex];
  const sceneFrame = frame - firstFrame - activeIndex * sceneLength;
  const inProgress = appear(sceneFrame, 0, 12);
  const scale = interpolate(inProgress, [0, 1], [0.97, 1]);
  const titleSpring = spring({
    frame: sceneFrame,
    fps,
    config: { damping: 16, mass: 0.65 },
  });

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          top: 176,
          display: "flex",
          gap: 34,
          alignItems: "center",
          opacity: inProgress,
          transform: `scale(${scale})`,
        }}
      >
        <TrendVisual trend={props.featuredTrend} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: accentColor(scene),
              fontSize: 36,
              lineHeight: 1,
              fontWeight: 900,
              marginBottom: 26,
              textTransform: "uppercase",
            }}
          >
            {scene.kicker}
          </div>
          <div
            style={{
              color: colors.text,
              fontSize: 88,
              lineHeight: 0.98,
              fontWeight: 900,
              overflowWrap: "break-word",
              transform: `translateY(${interpolate(titleSpring, [0, 1], [26, 0])}px)`,
            }}
          >
            {scene.text}
          </div>
          {scene.detail ? (
            <div
              style={{
                color: colors.muted,
                fontSize: 34,
                lineHeight: 1.22,
                marginTop: 30,
                maxWidth: 610,
              }}
            >
              {safeText(scene.detail, 92)}
            </div>
          ) : null}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          top: 980,
          borderTop: `1px solid ${colors.line}`,
          paddingTop: 36,
          color: colors.text,
          fontSize: 43,
          lineHeight: 1.15,
          fontWeight: 760,
        }}
      >
        {safeText(props.featuredTrend?.label || props.subtitle, 90)}
      </div>

      <MetricStrip trend={props.featuredTrend} />

      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          bottom: 146,
          height: 5,
          background: "rgba(255,255,255,0.12)",
          borderRadius: 8,
        }}
      >
        <div
          style={{
            width: `${((activeIndex + inProgress) / scenes.length) * 100}%`,
            height: "100%",
            background: accentColor(scene),
            borderRadius: 8,
          }}
        />
      </div>
    </>
  );
}

function CountdownLayout({ props }: { props: SocialVideoProps }) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const finalStart = durationInFrames - 132;
  const introEnd = 128;
  const trends = props.trends.slice(0, 5);
  const trendLength = Math.max(1, Math.floor((finalStart - introEnd) / 5));
  const activeIndex =
    frame < introEnd
      ? -1
      : Math.min(4, Math.max(0, Math.floor((frame - introEnd) / trendLength)));
  const activeTrend = activeIndex >= 0 ? trends[activeIndex] : null;
  const introProgress = appear(frame, 32, 14);
  const activeFrame = activeIndex >= 0 ? frame - introEnd - activeIndex * trendLength : 0;
  const cardSpring = spring({
    frame: activeFrame,
    fps,
    config: { damping: 18, mass: 0.7 },
  });

  return (
    <>
      {activeIndex === -1 ? (
        <div
          style={{
            position: "absolute",
            left: 72,
            right: 72,
            top: 230,
            opacity: introProgress,
            transform: `translateY(${interpolate(introProgress, [0, 1], [26, 0])}px)`,
          }}
        >
          <div
            style={{
              color: colors.lime,
              fontSize: 38,
              fontWeight: 900,
              marginBottom: 28,
            }}
          >
            NO PUBLIQUES A CIEGAS
          </div>
          <div
            style={{
              color: colors.text,
              fontSize: 104,
              lineHeight: 1,
              fontWeight: 900,
            }}
          >
            Estas son las 5 senales que TikTok esta empujando hoy.
          </div>
        </div>
      ) : null}

      {activeTrend ? (
        <div
          style={{
            position: "absolute",
            left: 72,
            right: 72,
            top: 185,
            opacity: interpolate(cardSpring, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(cardSpring, [0, 1], [36, 0])}px)`,
          }}
        >
          <div
            style={{
              color: colors.muted,
              fontSize: 32,
              textTransform: "uppercase",
              fontWeight: 850,
              marginBottom: 18,
            }}
          >
            tendencia {activeIndex + 1} de 5
          </div>
          <div
            style={{
              color: activeIndex === 0 ? colors.lime : colors.text,
              fontSize: 142,
              lineHeight: 0.92,
              fontWeight: 920,
            }}
          >
            #{activeTrend.position}
          </div>
          <div
            style={{
              color: colors.text,
              fontSize: 76,
              lineHeight: 1.02,
              fontWeight: 880,
              marginTop: 34,
              overflowWrap: "break-word",
            }}
          >
            {safeText(activeTrend.label, 72)}
          </div>
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 42,
            }}
          >
            <MiniMetric label="views" value={compactNumber(activeTrend.views)} />
            <MiniMetric label="likes" value={compactNumber(activeTrend.likes)} />
          </div>
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          bottom: 184,
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 10,
        }}
      >
        {trends.map((trend, index) => (
          <div
            key={trend.apifyId}
            style={{
              height: 8,
              borderRadius: 8,
              background:
                index <= activeIndex ? colors.lime : "rgba(255,255,255,0.14)",
            }}
          />
        ))}
      </div>
    </>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: `1px solid ${colors.line}`,
        borderRadius: 8,
        padding: "20px 24px",
        minWidth: 180,
        background: colors.panel,
      }}
    >
      <div style={{ color: colors.muted, fontSize: 22, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ color: colors.lime, fontSize: 44, fontWeight: 850 }}>
        {value}
      </div>
    </div>
  );
}

function BrandEndCard() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const start = durationInFrames - 132;
  const progress = appear(frame, start, 28);
  const logoScale = interpolate(progress, [0, 1], [0.95, 1]);

  return (
    <AbsoluteFill
      style={{
        opacity: progress,
        background:
          "linear-gradient(180deg, rgba(7,9,13,0), rgba(7,9,13,0.94) 24%, #07090d)",
        alignItems: "center",
        justifyContent: "center",
        padding: 84,
      }}
    >
      <div
        style={{
          transform: `scale(${logoScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            color: colors.text,
            fontSize: 96,
            fontWeight: 850,
            marginBottom: 42,
          }}
        >
          Go viral.
        </div>
        <Img
          src={staticFile("logo.png")}
          style={{
            width: 270,
            height: 270,
            objectFit: "contain",
            marginBottom: 40,
          }}
        />
        <div style={{ color: colors.muted, fontSize: 40 }}>tikitify.com</div>
      </div>
    </AbsoluteFill>
  );
}

function MediaTracks({
  voiceoverSrc,
  backgroundMusicSrc,
}: {
  voiceoverSrc?: string | null;
  backgroundMusicSrc?: string | null;
}) {
  return (
    <>
      {backgroundMusicSrc ? (
        <Audio src={staticFile(backgroundMusicSrc)} volume={0.08} loop />
      ) : null}
      {voiceoverSrc ? <Audio src={staticFile(voiceoverSrc)} volume={1} /> : null}
    </>
  );
}

export function SocialVideo(props: SocialVideoProps) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <MediaTracks
        voiceoverSrc={props.voiceoverSrc}
        backgroundMusicSrc={props.backgroundMusicSrc}
      />
      <Background />
      <Header dateLabel={props.dateLabel} />
      {props.variant === "top-5-trends" ? (
        <CountdownLayout props={props} />
      ) : (
        <StoryScene props={props} />
      )}
      <BrandEndCard />
    </AbsoluteFill>
  );
}
