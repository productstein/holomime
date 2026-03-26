import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { TRPCProvider } from "@/lib/trpc-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "holomime — Give Your Agent a Soul",
  description: "The personality engine for AI agents. Build, version, test, and deploy structured identity across any LLM provider.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "holomime",
    description: "Give your agent a soul. Structured, versioned, cross-provider personality for AI agents.",
    siteName: "holomime",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={{ baseTheme: dark }}>
      <html lang="en" className="dark">
        <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased bg-[#09090b] text-zinc-100`}>
          <TRPCProvider>
            {children}
          </TRPCProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
