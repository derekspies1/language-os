import type { Metadata } from "next";
import "./learn.css";

export const metadata: Metadata = {
  title: "Learning Universe",
  description: "Explore the evidence-backed language knowledge growing across Language OS.",
};

export default function LearningUniverseLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
