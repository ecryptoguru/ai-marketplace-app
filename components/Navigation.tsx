"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";

export default function Navigation() {
  const pathname = usePathname();
  const { isConnected, address } = useAccount();
  const { open } = useWeb3Modal();

  return (
    <nav className="bg-white dark:bg-zinc-900 shadow-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Link href="/" className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
              FusionAI
            </Link>
            
            <div className="ml-10 flex items-center space-x-4">
              <Link 
                href="/" 
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  pathname === "/" 
                    ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300" 
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                Home
              </Link>
              
              <Link 
                href="/marketplace" 
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  pathname === "/marketplace" 
                    ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300" 
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                Marketplace
              </Link>
              
              <Link 
                href="/upload" 
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  pathname === "/upload" 
                    ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300" 
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                Upload Model
              </Link>

              {/* Dashboard Links - Visible only when connected */}
              {isConnected && (
                <>
                  <Link 
                    href="/dashboard/user" 
                    className={`px-3 py-2 rounded-md text-sm font-medium ${
                      pathname.startsWith("/dashboard/user") 
                        ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300" 
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    My Purchases
                  </Link>
                  <Link 
                    href="/dashboard/developer" 
                    className={`px-3 py-2 rounded-md text-sm font-medium ${
                      pathname.startsWith("/dashboard/developer") 
                        ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300" 
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    My Models
                  </Link>
                </>
              )}
            </div>
          </div>
          
          <div>
            {isConnected ? (
              <div className="flex items-center">
                <span className="text-sm text-gray-700 dark:text-gray-300 mr-2">
                  {`${address?.slice(0, 6)}...${address?.slice(-4)}`}
                </span>
                <button
                  onClick={() => open()}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Switch Wallet
                </button>
              </div>
            ) : (
              <button
                onClick={() => open()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md text-sm font-medium text-white"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
