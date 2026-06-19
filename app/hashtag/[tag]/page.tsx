import type { Metadata } from "next";
import HomeClient from "../../HomeClient";
import {
  formatHashtag,
  getHashtagSlug,
  normalizeHashtagName,
} from "../../../lib/hashtags";
import { getVideosByHashtag } from "../../../lib/trends";

type PageProps = {
  params: Promise<{ tag: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { tag: rawTag } = await params;
  const tag = normalizeHashtagName(rawTag);
  const displayTag = formatHashtag(tag);

  return {
    title: `${displayTag} TikTok Videos Today | Tikitify`,
    description: `Discover viral TikTok videos using ${displayTag}, updated automatically on Tikitify.`,
    robots: {
      index: false,
      follow: true,
    },
    alternates: {
      canonical: `/hashtag/${getHashtagSlug(tag)}`,
    },
    openGraph: {
      title: `${displayTag} TikTok Videos Today | Tikitify`,
      description: `Discover viral TikTok videos using ${displayTag}.`,
      url: `https://www.tikitify.com/hashtag/${getHashtagSlug(tag)}`,
      siteName: "Tikitify",
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: `${displayTag} TikTok Videos Today`,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${displayTag} TikTok Videos Today | Tikitify`,
      description: `Discover viral TikTok videos using ${displayTag}.`,
      images: ["/og-image.png"],
    },
  };
}

export default async function HashtagPage({ params }: PageProps) {
  const { tag: rawTag } = await params;
  const tag = normalizeHashtagName(rawTag);
  const trends = await getVideosByHashtag(tag);

  return <HomeClient initialTrends={trends} pageTitle={formatHashtag(tag)} />;
}
