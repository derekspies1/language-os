import type { Metadata } from "next";
import "./exposure.css";

export const metadata: Metadata = {
  title: "Daily Exposure",
  description: "A tiny Korean-first exposure loop that turns interests into learner-memory evidence.",
};

export default function ExposureLayout({ children }: { children: React.ReactNode }) {
  return children;
}
