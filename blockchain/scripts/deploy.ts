// scripts/deploy.ts
import { ethers, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());
  console.log("Network:", network.name);

  const platformFeeWallet = "0xfe42de0fad386dbabf31c994c1b3b20ceedba0ea"; // Platform Fee Wallet
  const platformFeePercent = 3; // Platform Fee 3%

  // --- Deploy FusionAI_ModelRegistry ---
  console.log("\nDeploying FusionAI_ModelRegistry...");
  const ModelRegistryFactory = await ethers.getContractFactory("FusionAI_ModelRegistry");
  const modelRegistry = await ModelRegistryFactory.deploy(); // Deploy without arguments
  await modelRegistry.waitForDeployment();
  const modelRegistryAddress = await modelRegistry.getAddress();
  console.log(`FusionAI_ModelRegistry deployed to: ${modelRegistryAddress}`);

  // --- Deploy FusionAI_Marketplace ---
  console.log("\nDeploying FusionAI_Marketplace...");
  const MarketplaceFactory = await ethers.getContractFactory("FusionAI_Marketplace");
  const marketplace = await MarketplaceFactory.deploy(
    modelRegistryAddress, // Registry Address
    deployer.address,     // Initial Owner
    platformFeeWallet,    // Platform Fee Wallet
    platformFeePercent    // Platform Fee Percent
  );
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`FusionAI_Marketplace deployed to: ${marketplaceAddress}`);

  console.log("\nDeployment Complete!");
  console.log("Registry Address:", modelRegistryAddress);
  console.log("Marketplace Address:", marketplaceAddress);

  // --- Optional: Verify on Etherscan (if API key is configured) ---
  // Add a delay before verification to allow Etherscan to index
  // if (network.name === "sepolia") {
  //   console.log("\nWaiting for 5 confirmations before verification...");
  //   await modelRegistry.deploymentTransaction()?.wait(5);
  //   console.log("Verifying Registry on Etherscan...");
  //   try {
  //     await hre.run("verify:verify", {
  //       address: modelRegistryAddress,
  //       constructorArguments: [], // Removed deployer.address
  //     });
  //     console.log("Registry Verified!");
  //   } catch (error) {
  //     console.error("Registry Verification failed:", error);
  //   }

  //   console.log("\nWaiting for 5 confirmations before verification...");
  //   await marketplace.deploymentTransaction()?.wait(5);
  //   console.log("Verifying Marketplace on Etherscan...");
  //   try {
  //     await hre.run("verify:verify", {
  //       address: marketplaceAddress,
  //       constructorArguments: [
  //         modelRegistryAddress,
  //         deployer.address,
  //         platformFeeWallet,
  //         platformFeePercent
  //       ],
  //     });
  //     console.log("Marketplace Verified!");
  //   } catch (error) {
  //     console.error("Marketplace Verification failed:", error);
  //   }
  // }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
