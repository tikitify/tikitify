import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.tikitify.com"),
  title: "Tikitify | TikTok Trends Today",
  description: "Discover today's viral TikTok trends, updated automatically.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Tikitify",
    description: "TikTok Trends Today",
    url: "https://www.tikitify.com",
    siteName: "Tikitify",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Tikitify - TikTok Trends Today",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tikitify",
    description: "TikTok Trends Today",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-N5RZP3QJE4"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-N5RZP3QJE4');
          `}
        </Script>
      </head>

      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}