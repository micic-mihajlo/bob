import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Anton, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const anton = Anton({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bob and B(l)obs",
  description: "Bob and his lil builders.",
};

/** Sets the saved theme before the first paint, so a reload never flashes the other look. */
const themeScript = `try{var t=localStorage.getItem("bob-theme");if(t==="ink"&&localStorage.getItem("bob-theme-picked")!=="1")t="classic";if(t!=="newsprint"&&t!=="ink")t="classic";var r=document.documentElement;r.dataset.theme=t;if(t!=="classic")r.dataset.print=""}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${anton.variable}`} data-theme="classic" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
