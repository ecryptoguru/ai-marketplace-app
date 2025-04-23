import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "@openzeppelin/hardhat-upgrades";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Get environment variables or throw error if missing
const sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL;
const privateKey = process.env.PRIVATE_KEY;
const etherscanApiKey = process.env.ETHERSCAN_API_KEY;

if (!sepoliaRpcUrl) {
  throw new Error("Missing SEPOLIA_RPC_URL in .env file");
}

if (!privateKey) {
  throw new Error("Missing PRIVATE_KEY in .env file");
}

if (!etherscanApiKey) {
  throw new Error("Missing ETHERSCAN_API_KEY in .env file");
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.22", // Match the pragma in your contracts
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      // Configuration for the local Hardhat Network
    },
    sepolia: {
      url: sepoliaRpcUrl,
      accounts: [privateKey],
      // Optional: You might need to set gas price or other options depending on the network
      // gasPrice: 20000000000, // Example: 20 Gwei
    },
  },
  etherscan: {
    apiKey: etherscanApiKey,
  },
  // Optional: Configure gas reporter
  // gasReporter: {
  //   enabled: process.env.REPORT_GAS !== undefined,
  //   currency: "USD",
  // },
};

export default config;
