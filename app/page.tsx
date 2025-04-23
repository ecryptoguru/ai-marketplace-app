"use client";

import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-16 p-8 sm:p-20 bg-background text-foreground">
      <header className="flex flex-col items-center gap-2">
        <Image
          src="/logo.svg"
          alt="FusionAI Logo"
          width={64}
          height={64}
          priority
        />
        <h1 className="text-4xl font-bold tracking-tight">FusionAI Marketplace</h1>
        <p className="text-lg text-muted-foreground max-w-xl text-center">
          Discover, buy, and sell AI models. Secure, decentralizeds and open.
        </p>
      </header>

      <nav className="flex gap-6 flex-wrap items-center justify-center">
        <Link href="/marketplace" className="font-semibold hover:underline underline-offset-4">Marketplace</Link>
        <Link href="/upload" className="font-semibold hover:underline underline-offset-4">Upload Model</Link>
        <Link href="/dashboard/user" className="font-semibold hover:underline underline-offset-4">My Purchases</Link>
        <Link href="/dashboard/developer" className="font-semibold hover:underline underline-offset-4">My Models</Link>
      </nav>

      <footer className="mt-16 flex flex-col items-center gap-2 text-xs text-muted-foreground">
        <span>
          &copy; {new Date().getFullYear()} FusionAI. All rights reserved.
        </span>
        <a
          href="https://github.com/defiankit/ai-marketplace"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
