import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { FusionAI_ModelRegistry } from "../typechain-types"; // Adjust if typechain output dir changes
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { EventLog } from "ethers"; // Import EventLog

describe("FusionAI_ModelRegistry", function () {
  // Define SaleType enum values based on the contract
  const SaleType = {
    NotForSale: 0,
    Copies: 1,
    Subscription: 2,
  };

  // We define a fixture to reuse the same setup in every test.
  async function deployRegistryFixture() {
    // Get signers
    const [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy the contract
    const RegistryFactory = await ethers.getContractFactory("FusionAI_ModelRegistry");
    const registry = await RegistryFactory.deploy();
    await registry.waitForDeployment();

    // Define some sample IPFS hashes
    const ipfsHash1 = "QmXyZ123";
    const ipfsHash2 = "QmABC456";
    const ipfsHash3 = "QmDEF789";

    return { registry, owner, addr1, addr2, ipfsHash1, ipfsHash2, ipfsHash3 };
  }

  describe("Deployment", function () {
    it("Should set the right initial model ID counter", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      expect(await registry.getModelIdCounter()).to.equal(0);
    });
  });

  describe("Model Registration", function () {
    it("Should allow a user to register a model", async function () {
      const { registry, owner, ipfsHash1 } = await loadFixture(deployRegistryFixture);
      const initialSaleType = SaleType.Copies;

      await expect(registry.registerModel(ipfsHash1, initialSaleType))
        .to.emit(registry, "ModelRegistered")
        .withArgs(1, owner.address, ipfsHash1, initialSaleType);

      // Check model data
      const modelId = 1;
      const model = await registry.models(modelId);
      expect(model.owner).to.equal(owner.address);
      expect(model.ipfsMetadataHash).to.equal(ipfsHash1);
      expect(model.saleType).to.equal(initialSaleType);
      expect(model.listTimestamp).to.be.gt(0); // Check timestamp is set

      // Check counter and hash existence
      expect(await registry.getModelIdCounter()).to.equal(1);
      expect(await registry.ipfsHashExists(ipfsHash1)).to.be.true;
    });

    it("Should prevent registering with an empty IPFS hash", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      await expect(registry.registerModel("", SaleType.NotForSale))
        .to.be.revertedWith("Registry: IPFS hash cannot be empty");
    });

    it("Should prevent registering the same IPFS hash twice", async function () {
      const { registry, ipfsHash1, addr1 } = await loadFixture(deployRegistryFixture);
      await registry.registerModel(ipfsHash1, SaleType.Copies);

      // Attempt to register the same hash again (even by another user)
      await expect(registry.connect(addr1).registerModel(ipfsHash1, SaleType.Subscription))
        .to.be.revertedWith("Registry: IPFS hash already registered");
    });

    it("Should correctly increment model IDs", async function () {
      const { registry, owner, addr1, ipfsHash1, ipfsHash2 } = await loadFixture(deployRegistryFixture);

      await expect(registry.registerModel(ipfsHash1, SaleType.Copies))
        .to.emit(registry, "ModelRegistered")
        .withArgs(1, owner.address, ipfsHash1, SaleType.Copies);

      await expect(registry.connect(addr1).registerModel(ipfsHash2, SaleType.Subscription))
        .to.emit(registry, "ModelRegistered")
        .withArgs(2, addr1.address, ipfsHash2, SaleType.Subscription);

      expect(await registry.getModelIdCounter()).to.equal(2);
      const model2 = await registry.models(2);
      expect(model2.owner).to.equal(addr1.address);
    });
  });

  describe("Metadata Update", function () {
    let registry: FusionAI_ModelRegistry;
    let owner: SignerWithAddress, addr1: SignerWithAddress; // Added types
    let ipfsHash1: string, ipfsHash2: string;
    const modelId = 1;

    // Setup before each test in this block
    beforeEach(async function () {
      // Removed unused owner, ipfsHash3 from destructuring here
      const fixture = await loadFixture(deployRegistryFixture);
      registry = fixture.registry;
      addr1 = fixture.addr1;
      ipfsHash1 = fixture.ipfsHash1;
      ipfsHash2 = fixture.ipfsHash2;
      // Get owner signer reference separately if needed for a specific test
      owner = fixture.owner;

      // Register an initial model (using owner from the scope)
      await registry.connect(owner).registerModel(ipfsHash1, SaleType.Copies);
    });

    it("Should allow the owner to update metadata", async function () {
      await expect(registry.connect(owner).updateModelMetadata(modelId, ipfsHash2))
        .to.emit(registry, "ModelMetadataUpdated")
        .withArgs(modelId, ipfsHash2);

      const model = await registry.models(modelId);
      expect(model.ipfsMetadataHash).to.equal(ipfsHash2);
      expect(await registry.ipfsHashExists(ipfsHash1)).to.be.false; // Old hash should be marked false
      expect(await registry.ipfsHashExists(ipfsHash2)).to.be.true;  // New hash should be marked true
    });

    it("Should prevent non-owners from updating metadata", async function () {
      await expect(registry.connect(addr1).updateModelMetadata(modelId, ipfsHash2))
        .to.be.revertedWith("Registry: Caller is not the model owner");
    });

    it("Should prevent updating with an empty IPFS hash", async function () {
      await expect(registry.connect(owner).updateModelMetadata(modelId, ""))
        .to.be.revertedWith("Registry: New IPFS hash cannot be empty");
    });

     it("Should prevent updating metadata to an already registered hash (by another model)", async function () {
        // Register a second model with ipfsHash2
        await registry.connect(addr1).registerModel(ipfsHash2, SaleType.Subscription);

        // Attempt to update model 1's hash to ipfsHash2 (which is already in use)
        await expect(registry.connect(owner).updateModelMetadata(modelId, ipfsHash2))
            .to.be.revertedWith("Registry: New IPFS hash already registered by another model");
    });

    it("Should allow updating metadata back to the original hash if no other model uses it", async function () {
        // Update to hash2 first
        await registry.connect(owner).updateModelMetadata(modelId, ipfsHash2);
        expect(await registry.ipfsHashExists(ipfsHash1)).to.be.false;
        expect(await registry.ipfsHashExists(ipfsHash2)).to.be.true;

        // Update back to hash1
        await expect(registry.connect(owner).updateModelMetadata(modelId, ipfsHash1))
            .to.emit(registry, "ModelMetadataUpdated")
            .withArgs(modelId, ipfsHash1);

        const model = await registry.models(modelId);
        expect(model.ipfsMetadataHash).to.equal(ipfsHash1);
        expect(await registry.ipfsHashExists(ipfsHash1)).to.be.true;
        expect(await registry.ipfsHashExists(ipfsHash2)).to.be.false;
    });

     it("Should not emit event or change state if updating with the same hash", async function () {
        // Try updating with the same hash it already has
        const tx = await registry.connect(owner).updateModelMetadata(modelId, ipfsHash1);
        const receipt = await tx.wait();

        // Check that no event was emitted - using eventName
        const emittedEvent = receipt?.logs.find(log => (log as EventLog).eventName === 'ModelMetadataUpdated');
        expect(emittedEvent).to.be.undefined;

        const model = await registry.models(modelId);
        expect(model.ipfsMetadataHash).to.equal(ipfsHash1); // Hash remains the same
        expect(await registry.ipfsHashExists(ipfsHash1)).to.be.true;
    });
  });

  describe("Sale Type Update", function () {
    let registry: FusionAI_ModelRegistry;
    let owner: SignerWithAddress, addr1: SignerWithAddress; // Added types
    let ipfsHash1: string;
    const modelId = 1;
    const initialSaleType = SaleType.Copies;

    beforeEach(async function () {
      // Removed unused owner from destructuring here
      const fixture = await loadFixture(deployRegistryFixture);
      registry = fixture.registry;
      addr1 = fixture.addr1;
      ipfsHash1 = fixture.ipfsHash1;
       // Get owner signer reference separately
      owner = fixture.owner;

      // Register an initial model (using owner from the scope)
      await registry.connect(owner).registerModel(ipfsHash1, initialSaleType);
    });

    it("Should allow the owner to update the sale type", async function () {
      const newSaleType = SaleType.Subscription;
      await expect(registry.connect(owner).setSaleType(modelId, newSaleType))
        .to.emit(registry, "ModelSaleTypeSet")
        .withArgs(modelId, newSaleType);

      const model = await registry.models(modelId);
      expect(model.saleType).to.equal(newSaleType);
    });

    it("Should prevent non-owners from updating the sale type", async function () {
      await expect(registry.connect(addr1).setSaleType(modelId, SaleType.NotForSale))
        .to.be.revertedWith("Registry: Caller is not the model owner");
    });

    it("Should not emit event if updating with the same sale type", async function () {
        const tx = await registry.connect(owner).setSaleType(modelId, initialSaleType); // Update with the same type
        const receipt = await tx.wait();

        // Check that no event was emitted - using eventName
        const emittedEvent = receipt?.logs.find(log => (log as EventLog).eventName === 'ModelSaleTypeSet');
        expect(emittedEvent).to.be.undefined;

        const model = await registry.models(modelId);
        expect(model.saleType).to.equal(initialSaleType); // Type remains the same
    });
  });
});
