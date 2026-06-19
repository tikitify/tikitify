import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import { getTrendsByMarket } from "../lib/trends";

export const metadata: Metadata = {
  title: "TikTok Trends Spain Today | Tikitify",
  description:
    "Discover today's viral TikTok trends in Spain, updated automatically.",
  alternates: {
    canonical: "/",
  },
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const trends = await getTrendsByMarket("spain");

  return <HomeClient initialMarket="spain" initialTrends={trends} />;
}
