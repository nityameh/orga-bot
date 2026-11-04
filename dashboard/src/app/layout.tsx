import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orga Dashboard",
  description: "Manage your notes, tasks, and reminders",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
