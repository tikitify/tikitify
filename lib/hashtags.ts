export type Market = "global" | "spain";

export type Trend = {
  id?: number;
  apify_id: string;
  position: number;
  market: Market;
  audio: string | null;
  hashtags: string | null;
  image_url: string | null;
  video_url: string | null;
  views: number | null;
  likes: number | null;
  shares: number | null;
  comments: number | null;
  tiktok_url: string | null;
  author_username: string | null;
};

const HASHTAG_PATTERN = /#[\p{L}\p{N}_]+/gu;

export function normalizeHashtagName(value: string) {
  let decodedValue = value;

  try {
    decodedValue = decodeURIComponent(value);
  } catch {
    decodedValue = value;
  }

  return decodedValue
    .normalize("NFKC")
    .replace(/^#+/, "")
    .trim()
    .toLowerCase();
}

export function extractHashtagNames(hashtags: string | null | undefined) {
  if (!hashtags) return [];

  const matches = hashtags.match(HASHTAG_PATTERN) || [];
  const unique = new Map<string, string>();

  for (const match of matches) {
    const name = normalizeHashtagName(match);
    if (name) unique.set(name, name);
  }

  return Array.from(unique.values());
}

export function getHashtagSlug(value: string) {
  return encodeURIComponent(normalizeHashtagName(value));
}

export function getHashtagHref(value: string) {
  const slug = getHashtagSlug(value);
  return slug ? `/hashtag/${slug}` : "/";
}

export function formatHashtag(value: string) {
  const name = normalizeHashtagName(value);
  return name ? `#${name}` : "#";
}

export function trendMatchesHashtag(
  trend: { hashtags?: string | null },
  hashtag: string
) {
  const normalized = normalizeHashtagName(hashtag);
  return extractHashtagNames(trend.hashtags).includes(normalized);
}
