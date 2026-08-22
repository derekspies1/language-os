import type { Metadata } from "next";
import "./song-study.css";

export const metadata: Metadata = {
  title: "Song Study Studio",
  description: "Loop a song you love and build your own synchronized language-learning layer into it.",
};

export default function SongStudyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
