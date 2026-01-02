import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import VercelAnalytics from "./analytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Smilefjeskartet – Restaurantkontroller fra Mattilsynet",
  description:
    "Se Mattilsynets smilefjeskontroller på restaurantene i Norge. Kart med smil, strek og sur munn – basert på offentlig data.",
  keywords: [
    "smilefjes",
    "mattilsynet",
    "restaurantkontroll",
    "smilefjeskart",
    "smilefjeskartet",
    "restaurant hygiene",
    "matkontroll norge",
  ],
  metadataBase: new URL("https://smilefjeskartet.no"),
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <VercelAnalytics />
      </body>
    </html>
  );
}
