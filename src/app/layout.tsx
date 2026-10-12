import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import { site } from "@/config/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });

export const metadata: Metadata = {
  title: site.name,
  description: site.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
