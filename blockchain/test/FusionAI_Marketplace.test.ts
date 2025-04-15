import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

// Define SaleType enum values explicitly as numbers for testing
const SaleType = {
    None: 0,
    Copies: 1,
    Subscription: 2 // Assuming Subscription is 2, adjust if different
};

describe("FusionAI_Marketplace", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployMarketplaceFixture() {
        // Contracts are deployed using the first signer/account by default
        const [owner, developer, buyer1, buyer2, otherAccount] = await ethers.getSigners();

        // Deploy the Model Registry first
        const ModelRegistryFactory = await ethers.getContractFactory("FusionAI_ModelRegistry");
        // Constructor takes no arguments, so remove owner.address
        const registry = await ModelRegistryFactory.deploy(); 
        await registry.waitForDeployment();
        const registryAddress = await registry.getAddress();

        // Deploy the Marketplace, linking it to the Registry
        const platformFeeWallet = otherAccount; // Use a different account for fees
        const platformFeePercent = 3; // 3%
        const MarketplaceFactory = await ethers.getContractFactory("FusionAI_Marketplace");
        const marketplace = await MarketplaceFactory.deploy(
            registryAddress,
            owner.address, // Add initial owner argument for Ownable
            platformFeeWallet.address,
            platformFeePercent
        );
        await marketplace.waitForDeployment();
        const marketplaceAddress = await marketplace.getAddress();

        // Helper function to register a model for testing
        const registerModel = async (devSigner: HardhatEthersSigner, ipfsHash: string) => {
            // Get the current count (which is the ID that *will* be assigned)
            const currentCount = await registry.modelCount();

            // Perform the registration
            const tx = await registry.connect(devSigner).registerModel(ipfsHash, SaleType.None);
            await tx.wait(); // Wait for transaction

            // Return the count we captured BEFORE the registration call
            return currentCount;
        };

        return { marketplace, registry, owner, developer, buyer1, buyer2, platformFeeWallet, platformFeePercent, registerModel, marketplaceAddress, registryAddress };
    }

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            const { marketplace, owner } = await loadFixture(deployMarketplaceFixture);
            expect(await marketplace.owner()).to.equal(owner.address);
        });

        it("Should set the right registry address", async function () {
            const { marketplace, registryAddress } = await loadFixture(deployMarketplaceFixture);
            expect(await marketplace.registry()).to.equal(registryAddress);
        });

        it("Should set the right platform fee wallet", async function () {
            const { marketplace, platformFeeWallet } = await loadFixture(deployMarketplaceFixture);
            expect(await marketplace.platformFeeWallet()).to.equal(platformFeeWallet.address);
        });

        it("Should set the right platform fee percentage", async function () {
            const { marketplace, platformFeePercent } = await loadFixture(deployMarketplaceFixture);
            expect(await marketplace.platformFeePercent()).to.equal(platformFeePercent);
        });
    });

    // --- Tests for listItemForCopies --- 
    describe("listItemForCopies", function () {
        it("Should allow a model owner to list their model for copy sale", async function () {
            const { marketplace, developer, registerModel } = await loadFixture(deployMarketplaceFixture);

            const modelId = await registerModel(developer, "ipfs_hash_1");

            const price = ethers.parseEther("1");
            const totalCopies = BigInt(10);

            // Execute the transaction first
            const tx = await marketplace.connect(developer).listItemForCopies(modelId, price, totalCopies);
            const receipt = await tx.wait(); // Wait for it to be mined

            // Now check the state
            const sale = await marketplace.copySales(modelId);
            expect(sale.price).to.equal(price);
            expect(sale.totalCopies).to.equal(totalCopies);
            expect(sale.soldCopies).to.equal(0);

            // Optionally, verify the event from the receipt (more robust way)
            // Find the event log in receipt.logs
            let eventFound = false;
            if (receipt?.logs) {
                const iface = marketplace.interface;
                for (const log of receipt.logs) {
                    try {
                        const parsedLog = iface.parseLog(log as unknown as { topics: string[], data: string });
                        if (parsedLog && parsedLog.name === "ItemListedForCopies") {
                            expect(parsedLog.args.modelId).to.equal(modelId);
                            expect(parsedLog.args.owner).to.equal(developer.address);
                            expect(parsedLog.args.price).to.equal(price);
                            expect(parsedLog.args.totalCopies).to.equal(totalCopies);
                            eventFound = true;
                            break;
                        }
                    } catch (_e) {
                        // eslint-disable-next-line no-empty
                    }
                }
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            expect(eventFound, "ItemListedForCopies event not found in receipt").to.be.true;

            // Original expect(...).to.emit(...) - keep commented out for now
            // await expect(marketplace.connect(developer).listItemForCopies(modelId, price, totalCopies))
            //     .to.emit(marketplace, "ItemListedForCopies")
            //     .withArgs(modelId, developer.address, price, totalCopies);
        });

        it("Should revert if the caller is not the model owner", async function () {
            const { marketplace, developer, buyer1, registerModel } = await loadFixture(deployMarketplaceFixture);
            const modelId = await registerModel(developer, "ipfs_hash_2");
            const price = ethers.parseEther("0.1");
            const totalCopies = 100;

            await expect(marketplace.connect(buyer1).listItemForCopies(modelId, price, totalCopies))
                .to.be.revertedWithCustomError(marketplace, "Marketplace_NotModelOwner");
        });

        it("Should revert if the price is zero", async function () {
            const { marketplace, developer, registerModel } = await loadFixture(deployMarketplaceFixture);
            const modelId = await registerModel(developer, "ipfs_hash_3");
            const price = ethers.parseEther("0");
            const totalCopies = 100;

            await expect(marketplace.connect(developer).listItemForCopies(modelId, price, totalCopies))
                .to.be.revertedWithCustomError(marketplace, "Marketplace_InvalidPrice");
        });

        it("Should revert if the total copies is zero", async function () {
            const { marketplace, developer, registerModel } = await loadFixture(deployMarketplaceFixture);
            const modelId = await registerModel(developer, "ipfs_hash_4");
            const price = ethers.parseEther("1");
            const zeroCopies = BigInt(0);
            await expect(marketplace.connect(developer).listItemForCopies(modelId, price, zeroCopies))
                .to.be.revertedWithCustomError(marketplace, "Marketplace_InvalidTotalCopies");
        });

        it("Should revert if the model ID does not exist", async function () {
            const { marketplace, developer } = await loadFixture(deployMarketplaceFixture);
            const nonExistentModelId = 999;
            const price = ethers.parseEther("0.1");
            const totalCopies = 100;

            await expect(marketplace.connect(developer).listItemForCopies(nonExistentModelId, price, totalCopies))
                .to.be.revertedWithCustomError(marketplace, "Marketplace_InvalidModelId");
        });

        it("Should revert if the model is already listed for copies", async function () {
            const { marketplace, developer, registerModel } = await loadFixture(deployMarketplaceFixture);
            const modelId = await registerModel(developer, "ipfs_hash_5");
            const price = ethers.parseEther("0.1");
            const totalCopies = 100;

            // List it once
            await marketplace.connect(developer).listItemForCopies(modelId, price, totalCopies);

            // Try to list it again
            await expect(marketplace.connect(developer).listItemForCopies(modelId, price, 50)) // Different copies
                .to.be.revertedWithCustomError(marketplace, "Marketplace_AlreadyListedForCopies");
        });
    });

    // --- Tests for buyCopy --- 
    // To be added

    // --- Tests for withdrawPlatformFees --- 
    // To be added

    // --- Tests for Edge Cases & Reverts --- 
    // To be added
});
