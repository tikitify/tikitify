export function getTikTokVideoId(url: string | null) {
  if (!url) return null;

  const match = url.match(/\/video\/(\d+)/);
  return match?.[1] || null;
}

export function getTikTokEmbedUrl(url: string | null) {
  const videoId = getTikTokVideoId(url);
  if (!videoId) return null;

  return `https://www.tiktok.com/embed/v2/${videoId}`;
}
