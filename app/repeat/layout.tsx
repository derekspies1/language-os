import type { Metadata } from "next";
import { headers } from "next/headers";
import "./repeat.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "language-os.local";
  const protocol = (requestHeaders.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "K-pop Repeat Studio",
    description: "Leave the song playing. Let understanding catch up through five Korean-first listening passes.",
    openGraph: {
      title: "Language OS · K-pop Repeat Studio",
      description: "Turn repeated K-pop listening into progressively deeper Korean comprehension.",
      type: "website",
      images: [{ url: image, width: 1729, height: 910, alt: "Language OS K-pop Repeat Studio" }],
    },
    twitter: { card: "summary_large_image", title: "Language OS · K-pop Repeat Studio", images: [image] },
  };
}

export default function RepeatLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
