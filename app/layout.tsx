import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { config, queryClient } from "@/lib/web3modal"; 
import { WagmiProvider } from "wagmi"; 
import { QueryClientProvider } from "@tanstack/react-query"; 
import Navigation from "@/components/Navigation";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "FusionAI Marketplace", 
  description: "Decentralized AI Marketplace on Ethereum", 
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
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <Navigation />
            <div className="min-h-screen bg-gray-50 dark:bg-black">
              {children}
            </div>
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  );
}
