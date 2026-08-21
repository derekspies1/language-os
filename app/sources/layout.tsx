import type { Metadata } from "next";
import "./sources.css";

export const metadata: Metadata = {
  title: "Source Packs",
  description: "Turn learner-supplied Korean lyrics and text into source-linked exposure and learner-memory evidence.",
};

export default function SourcesLayout({ children }: { children: React.ReactNode }) { return children; }
