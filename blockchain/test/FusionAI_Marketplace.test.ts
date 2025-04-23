import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

// Define SaleType enum values explicitly as numbers for testing
const SaleType = {
    None: 0,
    Copies: 1,
    Subscription: 2 // Assuming Subscription is 2, adjust if different
};

describe("FusionAI_Marketplace", function () {
    async function deployMarketplaceFixture() {
        const [owner, developer, buyer1, buyer2, otherAccount] = await ethers.getSigners();

        const ModelRegistryFactory = await ethers.getContractFactory("FusionAI_ModelRegistryUpgradeable");
        const registry = await upgrades.deployProxy(ModelRegistryFactory, [owner.address], { kind: "uups" });
        await registry.waitForDeployment();
        const registryAddress = await registry.getAddress();

        const platformFeeWallet = otherAccount;
        const platformFeePercent = 3;
        const MarketplaceFactory = await ethers.getContractFactory("FusionAI_MarketplaceUpgradeable");
        const marketplace = await upgrades.deployProxy(
            MarketplaceFactory,
            [registryAddress, owner.address, platformFeeWallet.address, platformFeePercent],
            { kind: "uups" }
        );
        await marketplace.waitForDeployment();
        await registry.connect(owner).setOperator(await marketplace.getAddress(), true);

        const registerModel = async (signer: HardhatEthersSigner, ipfsHash: string) => {
            const tx = await registry.connect(signer).registerModel(ipfsHash, SaleType.Copies);
            await tx.wait();
            const modelId = await registry.getModelIdCounter() - 1n;
            return { modelId, modelOwner: signer };
        };

        return { registry, marketplace, owner, developer, buyer1, buyer2, otherAccount, registerModel };
    }

    describe("listItemForCopies", function () {
        it("Should allow a model owner to list their model for copy sale", async function () {
            const { marketplace, developer, registerModel } = await loadFixture(deployMarketplaceFixture);
            const { modelId, modelOwner } = await registerModel(developer, "ipfs_1");
            const price = ethers.parseEther("0.1");
            const totalCopies = 10;
            await expect(
                marketplace.connect(modelOwner).listItemForCopies(modelId, price, totalCopies)
            ).to.emit(marketplace, "ItemListedForCopies");
        });
    });

    describe("Subscription Logic", function () {
        it("Should return true for active subscription in checkSubscription", async function () {
            const { marketplace, developer, buyer1, registerModel } = await loadFixture(deployMarketplaceFixture);
            const { modelId, modelOwner } = await registerModel(developer, "ipfs_sub_7");
            const rate = ethers.parseEther("0.1");
            const duration = 5 * 24 * 60 * 60;

            await marketplace.connect(modelOwner).listItemForSubscription(modelId, rate, duration);
            await marketplace.connect(buyer1).subscribe(modelId, { value: rate });

            const isActive = await marketplace.checkSubscription(modelId, buyer1.address);
            expect(isActive).to.equal(true);
        });

        it("Should return false for expired subscription in checkSubscription", async function () {
            const { marketplace, developer, buyer1, registerModel } = await loadFixture(deployMarketplaceFixture);
            const { modelId, modelOwner } = await registerModel(developer, "ipfs_sub_8");
            const rate = ethers.parseEther("0.1");
            const duration = 1 * 24 * 60 * 60;

            await marketplace.connect(modelOwner).listItemForSubscription(modelId, rate, duration);
            await marketplace.connect(buyer1).subscribe(modelId, { value: rate });

            await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine", []);

            const isActive = await marketplace.checkSubscription(modelId, buyer1.address);
            expect(isActive).to.equal(false);
        });
    });

    // --- Tests for withdrawPlatformFees --- 
    // To be added

    // --- Tests for Edge Cases & Reverts --- 
    // To be added
});
