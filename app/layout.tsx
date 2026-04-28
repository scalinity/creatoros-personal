import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "CreatorOS Personal",
  description: "Private creator-growth operating system for X and blog writing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
