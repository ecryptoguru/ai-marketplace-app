import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { FusionAI_ModelRegistry } from "../typechain-types"; // Adjust if typechain output dir changes
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { EventLog } from "ethers";

describe("FusionAI_ModelRegistry", function () {
  const SaleType = {
    NotForSale: 0,
    Copies: 1,
    Subscription: 2,
  };

  async function registerModel(registry: any, owner: SignerWithAddress, ipfsHash: string, saleType: number) {
    const tx = await registry.connect(owner).registerModel(ipfsHash, saleType);
    await tx.wait();
    const modelId = (await registry.getModelIdCounter()) - 1n;
    return { modelId, owner };
  }

  async function deployRegistryFixture() {
    const [owner, addr1, addr2] = await ethers.getSigners();
    const RegistryFactory = await ethers.getContractFactory("FusionAI_ModelRegistryUpgradeable");
    const registry = await upgrades.deployProxy(RegistryFactory, [owner.address], { kind: "uups" });
    await registry.waitForDeployment();
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
      await expect(registry.connect(owner).registerModel(ipfsHash1, initialSaleType))
        .to.emit(registry, "ModelRegistered")
        .withArgs(0, owner.address, ipfsHash1, initialSaleType);
      const modelId = 0;
      const model = await registry.models(modelId);
      expect(model.owner).to.equal(owner.address);
      expect(model.ipfsMetadataHash).to.equal(ipfsHash1);
      expect(model.saleType).to.equal(initialSaleType);
    });
  });

  describe("Metadata Update", function () {
    let registry: FusionAI_ModelRegistry;
    let owner: SignerWithAddress, addr1: SignerWithAddress;
    let ipfsHash1: string;
    const initialSaleType = SaleType.Copies;
    let modelId: bigint;

    beforeEach(async function () {
      const fixture = await loadFixture(deployRegistryFixture);
      registry = fixture.registry;
      addr1 = fixture.addr1;
      ipfsHash1 = fixture.ipfsHash1;
      owner = fixture.owner;
      const reg = await registerModel(registry, owner, ipfsHash1, initialSaleType);
      modelId = reg.modelId;
    });

    it("Should allow the owner to update metadata", async function () {
      const newHash = "QmNewMetaHash";
      await expect(registry.connect(owner).updateModelMetadata(modelId, newHash))
        .to.emit(registry, "ModelMetadataUpdated")
        .withArgs(modelId, newHash);
      const model = await registry.models(modelId);
      expect(model.ipfsMetadataHash).to.equal(newHash);
    });
  });

  describe("Sale Type Update", function () {
    let registry: FusionAI_ModelRegistry;
    let owner: SignerWithAddress, addr1: SignerWithAddress;
    let ipfsHash1: string;
    const initialSaleType = SaleType.Copies;
    let modelId: bigint;

    beforeEach(async function () {
      const fixture = await loadFixture(deployRegistryFixture);
      registry = fixture.registry;
      addr1 = fixture.addr1;
      ipfsHash1 = fixture.ipfsHash1;
      owner = fixture.owner;
      const reg = await registerModel(registry, owner, ipfsHash1, initialSaleType);
      modelId = reg.modelId;
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
        .to.be.revertedWith("Registry: Caller is not the model owner or approved operator");
    });

    it("Should not emit event if updating with the same sale type", async function () {
      const tx = await registry.connect(owner).setSaleType(modelId, initialSaleType);
      const receipt = await tx.wait();
      const emittedEvent = receipt?.logs.find(log => (log as EventLog).eventName === 'ModelSaleTypeSet');
      expect(emittedEvent).to.be.undefined;
      const model = await registry.models(modelId);
      expect(model.saleType).to.equal(initialSaleType);
    });
  });
});
