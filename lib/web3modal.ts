"use client";

import { createWeb3Modal } from '@web3modal/wagmi/react'
import { defaultWagmiConfig } from '@web3modal/wagmi/react/config'

import { sepolia } from 'wagmi/chains'
import { QueryClient } from '@tanstack/react-query'

// 0. Setup queryClient
export const queryClient = new QueryClient()

// 1. Get projectId from https://cloud.walletconnect.com
export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID

if (!projectId) throw new Error('NEXT_PUBLIC_PROJECT_ID is not set')

// 2. Create wagmiConfig
const metadata = {
  name: 'FusionAI Marketplace',
  description: 'Decentralized AI Marketplace on Ethereum',
  url: 'http://localhost:3000', // origin must match your domain & subdomain
  icons: ['https://avatars.githubusercontent.com/u/37784886']
}

const chains = [sepolia] as const
export const config = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
  // Optional - Add SSR support. Requires setting up "cookie" variable below
  // ssr: true,
  // storage: createStorage({ storage: cookieStorage })
})

// 3. Create modal
createWeb3Modal({
  wagmiConfig: config,
  projectId,
  enableAnalytics: true, // Optional - defaults to your Cloud configuration
  enableOnramp: true // Optional - false as default
})
