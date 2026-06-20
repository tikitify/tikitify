export type TrendCandidate = {
  apify_id: string;
  position: number;
  market: "global" | "spain";
  title: string | null;
  audio: string | null;
  hashtags: string | null;
  image_url: string | null;
  video_url: string | null;
  views: number | null;
  likes: number | null;
  tiktok_url: string | null;
  author_username: string | null;
};

export type SocialTrend = {
  apifyId: string;
  position: number;
  previousPosition?: number | null;
  positionsGained?: number;
  market: "global" | "spain";
  label: string;
  title?: string | null;
  audio?: string | null;
  hashtags?: string | null;
  imageUrl?: string | null;
  views?: number | null;
  likes?: number | null;
  authorUsername?: string | null;
};

export type SocialScene = {
  kicker: string;
  text: string;
  detail?: string;
  accent?: "lime" | "coral" | "cyan";
};

export type CaptionCue = {
  startFrame: number;
  endFrame: number;
  text: string;
};

export type SocialVideoVariant =
  | "top-viral-story"
  | "biggest-climber"
  | "top-5-trends";

export type SocialVideoProps = {
  variant: SocialVideoVariant;
  dateLabel: string;
  title: string;
  subtitle: string;
  hook: string;
  metricLabel?: string;
  metricValue?: string;
  secondaryMetricLabel?: string;
  secondaryMetricValue?: string;
  scenes: SocialScene[];
  scriptLines: string[];
  featuredTrend?: SocialTrend | null;
  trends: SocialTrend[];
  voiceoverSrc?: string | null;
  backgroundMusicSrc?: string | null;
};

export type TopViralStoryProps = {
  trend: TrendCandidate;
  storyAngleTopic: string;
  storyAngleAction: string;
  backgroundVideoSrc: string;
  voiceoverSrc: string;
  outroAudioSrc: string;
  captions: CaptionCue[];
  storyDurationInFrames: number;
  outroDurationInFrames: number;
};

