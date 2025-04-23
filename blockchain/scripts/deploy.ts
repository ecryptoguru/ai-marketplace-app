import { ethers, network, upgrades } from "hardhat";
import fs from "fs";
import path from "path";
import hre from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());
  console.log("Network:", network.name);

  const platformFeeWallet = "0xfe42de0fad386dbabf31c994c1b3b20ceedba0ea"; // Platform Fee Wallet
  const platformFeePercent = 3; // Platform Fee 3%

  // --- Deploy FusionAI_ModelRegistryUpgradeable as UUPS Proxy ---
  console.log("\nDeploying FusionAI_ModelRegistryUpgradeable (UUPS proxy)...");
  const ModelRegistryFactory = await ethers.getContractFactory("FusionAI_ModelRegistryUpgradeable");
  const modelRegistry = await upgrades.deployProxy(ModelRegistryFactory, [deployer.address], { kind: "uups" });
  await modelRegistry.waitForDeployment();
  const modelRegistryAddress = await modelRegistry.getAddress();
  console.log(`FusionAI_ModelRegistryUpgradeable (proxy) deployed to: ${modelRegistryAddress}`);

  // --- Deploy FusionAI_MarketplaceUpgradeable as UUPS Proxy ---
  console.log("\nDeploying FusionAI_MarketplaceUpgradeable (UUPS proxy)...");
  const MarketplaceFactory = await ethers.getContractFactory("FusionAI_MarketplaceUpgradeable");
  const marketplace = await upgrades.deployProxy(
    MarketplaceFactory,
    [modelRegistryAddress, deployer.address, platformFeeWallet, platformFeePercent],
    { kind: "uups" }
  );
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`FusionAI_MarketplaceUpgradeable (proxy) deployed to: ${marketplaceAddress}`);

  // --- Set Marketplace as Operator in Registry ---
  console.log("\nSetting Marketplace as operator in ModelRegistry...");
  const tx = await modelRegistry.connect(deployer).setOperator(marketplaceAddress, true);
  await tx.wait();
  console.log("Marketplace set as operator in ModelRegistry.");

  // --- Write Addresses and ABIs to Frontend/Backend ---
  const outDir = path.resolve(__dirname, "../abi");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const artifacts = hre.artifacts;
  const registryArtifact = await artifacts.readArtifact("FusionAI_ModelRegistryUpgradeable");
  const marketplaceArtifact = await artifacts.readArtifact("FusionAI_MarketplaceUpgradeable");
  fs.writeFileSync(
    path.join(outDir, "FusionAI_ModelRegistryUpgradeable.json"),
    JSON.stringify({ address: modelRegistryAddress, abi: registryArtifact.abi }, null, 2)
  );
  fs.writeFileSync(
    path.join(outDir, "FusionAI_MarketplaceUpgradeable.json"),
    JSON.stringify({ address: marketplaceAddress, abi: marketplaceArtifact.abi }, null, 2)
  );

  console.log("\nDeployment Complete!");
  console.log("Registry Address:", modelRegistryAddress);
  console.log("Marketplace Address:", marketplaceAddress);
  console.log(`ABIs and addresses written to ${outDir}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
