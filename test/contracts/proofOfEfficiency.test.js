const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

const { contractUtils } = require('@0xpolygonhermez/zkevm-commonjs');

const { calculateSnarkInput, calculateAccInputHash, calculateBatchHashData } = contractUtils;

describe('Polygon ZK-EVM', () => {
    let deployer;
    let trustedAggregator;
    let trustedSequencer;
    let admin;
    let aggregator1;

    let verifierContract;
    let polygonZkEVMBridgeContract;
    let polygonZkEVMContract;
    let maticTokenContract;
    let polygonZkEVMGlobalExitRoot;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const genesisRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';

    const networkIDMainnet = 0;
    const allowForcebatches = true;
    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const chainID = 1000;
    const networkName = 'zkevm';
    const pendingStateTimeoutDefault = 10;
    const trustedAggregatorTimeoutDefault = 10;

    beforeEach('Deploy contract', async () => {
        // load signers
        [deployer, trustedAggregator, trustedSequencer, admin, aggregator1] = await ethers.getSigners();

        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory(
            'VerifierRollupHelperMock',
        );
        verifierContract = await VerifierRollupHelperFactory.deploy();

        // deploy MATIC
        const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        maticTokenContract = await maticTokenFactory.deploy(
            maticTokenName,
            maticTokenSymbol,
            deployer.address,
            maticTokenInitialBalance,
        );
        await maticTokenContract.deployed();

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], { initializer: false });

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], { initializer: false });

        // deploy PolygonZkEVMMock
        const PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVMMock');
        polygonZkEVMContract = await upgrades.deployProxy(PolygonZkEVMFactory, [], { initializer: false });

        await polygonZkEVMGlobalExitRoot.initialize(polygonZkEVMContract.address, polygonZkEVMBridgeContract.address);
        await polygonZkEVMBridgeContract.initialize(networkIDMainnet, polygonZkEVMGlobalExitRoot.address, polygonZkEVMContract.address);
        await polygonZkEVMContract.initialize(
            polygonZkEVMGlobalExitRoot.address,
            maticTokenContract.address,
            verifierContract.address,
            polygonZkEVMBridgeContract.address,
            {
                admin: admin.address,
                chainID,
                trustedSequencer: trustedSequencer.address,
                pendingStateTimeout: pendingStateTimeoutDefault,
                forceBatchAllowed: allowForcebatches,
                trustedAggregator: trustedAggregator.address,
                trustedAggregatorTimeout: trustedAggregatorTimeoutDefault,
            },
            genesisRoot,
            urlSequencer,
            networkName,
        );

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(trustedSequencer.address, ethers.utils.parseEther('100'));
    });

    it('should check the constructor parameters', async () => {
        expect(await polygonZkEVMContract.globalExitRootManager()).to.be.equal(polygonZkEVMGlobalExitRoot.address);
        expect(await polygonZkEVMContract.matic()).to.be.equal(maticTokenContract.address);
        expect(await polygonZkEVMContract.rollupVerifier()).to.be.equal(verifierContract.address);
        expect(await polygonZkEVMContract.bridgeAddress()).to.be.equal(polygonZkEVMBridgeContract.address);

        expect(await polygonZkEVMContract.admin()).to.be.equal(admin.address);
        expect(await polygonZkEVMContract.chainID()).to.be.equal(chainID);
        expect(await polygonZkEVMContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await polygonZkEVMContract.pendingStateTimeout()).to.be.equal(pendingStateTimeoutDefault);
        expect(await polygonZkEVMContract.forceBatchAllowed()).to.be.equal(allowForcebatches);
        expect(await polygonZkEVMContract.trustedAggregator()).to.be.equal(trustedAggregator.address);
        expect(await polygonZkEVMContract.trustedAggregatorTimeout()).to.be.equal(trustedAggregatorTimeoutDefault);

        expect(await polygonZkEVMContract.batchNumToStateRoot(0)).to.be.equal(genesisRoot);
        expect(await polygonZkEVMContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await polygonZkEVMContract.networkName()).to.be.equal(networkName);

        expect(await polygonZkEVMContract.batchFee()).to.be.equal(ethers.utils.parseEther('1'));
    });

    it('should check setters of admin', async () => {
        expect(await polygonZkEVMContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await polygonZkEVMContract.forceBatchAllowed()).to.be.equal(allowForcebatches);
        expect(await polygonZkEVMContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await polygonZkEVMContract.trustedAggregator()).to.be.equal(trustedAggregator.address);
        expect(await polygonZkEVMContract.trustedAggregatorTimeout()).to.be.equal(trustedAggregatorTimeoutDefault);
        expect(await polygonZkEVMContract.pendingStateTimeout()).to.be.equal(pendingStateTimeoutDefault);
        expect(await polygonZkEVMContract.admin()).to.be.equal(admin.address);

        // setTrustedSequencer
        await expect(polygonZkEVMContract.setTrustedSequencer(deployer.address))
            .to.be.revertedWith('PolygonZkEVM::onlyAdmin: Only admin');
        await expect(
            polygonZkEVMContract.connect(admin).setTrustedSequencer(deployer.address),
        ).to.emit(polygonZkEVMContract, 'SetTrustedSequencer').withArgs(deployer.address);
        expect(await polygonZkEVMContract.trustedSequencer()).to.be.equal(deployer.address);

        // setForceBatchAllowed
        await expect(polygonZkEVMContract.setForceBatchAllowed(!allowForcebatches))
            .to.be.revertedWith('PolygonZkEVM::onlyAdmin: Only admin');
        await expect(
            polygonZkEVMContract.connect(admin).setForceBatchAllowed(!allowForcebatches),
        ).to.emit(polygonZkEVMContract, 'SetForceBatchAllowed').withArgs(!allowForcebatches);
        expect(await polygonZkEVMContract.forceBatchAllowed()).to.be.equal(!allowForcebatches);

        // setTrustedSequencerURL
        const url = 'https://test';
        await expect(polygonZkEVMContract.setTrustedSequencerURL(url))
            .to.be.revertedWith('PolygonZkEVM::onlyAdmin: Only admin');
        await expect(
            polygonZkEVMContract.connect(admin).setTrustedSequencerURL(url),
        ).to.emit(polygonZkEVMContract, 'SetTrustedSequencerURL').withArgs(url);
        expect(await polygonZkEVMContract.trustedSequencerURL()).to.be.equal(url);

        // setTrustedAggregator
        const newTrustedAggregator = deployer.address;
        await expect(polygonZkEVMContract.setTrustedAggregator(newTrustedAggregator))
            .to.be.revertedWith('PolygonZkEVM::onlyAdmin: Only admin');
        await expect(
            polygonZkEVMContract.connect(admin).setTrustedAggregator(newTrustedAggregator),
        ).to.emit(polygonZkEVMContract, 'SetTrustedAggregator').withArgs(newTrustedAggregator);
        expect(await polygonZkEVMContract.trustedAggregator()).to.be.equal(newTrustedAggregator);

        // setTrustedAggregatorTimeout
        await expect(polygonZkEVMContract.setTrustedAggregatorTimeout(trustedAggregatorTimeoutDefault))
            .to.be.revertedWith('PolygonZkEVM::onlyAdmin: Only admin');

        await expect(polygonZkEVMContract.connect(admin).setTrustedAggregatorTimeout(trustedAggregatorTimeoutDefault))
            .to.be.revertedWith('PolygonZkEVM::setTrustedAggregatorTimeout: New timeout must be lower');

        const newTrustedAggregatorTimeout = trustedAggregatorTimeoutDefault - 1;
        await expect(
            polygonZkEVMContract.connect(admin).setTrustedAggregatorTimeout(newTrustedAggregatorTimeout),
        ).to.emit(polygonZkEVMContract, 'SetTrustedAggregatorTimeout').withArgs(newTrustedAggregatorTimeout);
        expect(await polygonZkEVMContract.trustedAggregatorTimeout()).to.be.equal(newTrustedAggregatorTimeout);

        // setPendingStateTimeoutDefault
        await expect(polygonZkEVMContract.setPendingStateTimeout(pendingStateTimeoutDefault))
            .to.be.revertedWith('PolygonZkEVM::onlyAdmin: Only admin');

        await expect(polygonZkEVMContract.connect(admin).setPendingStateTimeout(pendingStateTimeoutDefault))
            .to.be.revertedWith('PolygonZkEVM::setPendingStateTimeout: New timeout must be lower');

        const newPendingStateTimeoutDefault = pendingStateTimeoutDefault - 1;
        await expect(
            polygonZkEVMContract.connect(admin).setPendingStateTimeout(newPendingStateTimeoutDefault),
        ).to.emit(polygonZkEVMContract, 'SetPendingStateTimeout').withArgs(newPendingStateTimeoutDefault);
        expect(await polygonZkEVMContract.pendingStateTimeout()).to.be.equal(newPendingStateTimeoutDefault);

        // setAdmin
        await expect(polygonZkEVMContract.setAdmin(deployer.address))
            .to.be.revertedWith('PolygonZkEVM::onlyAdmin: Only admin');
        await expect(
            polygonZkEVMContract.connect(admin).setAdmin(deployer.address),
        ).to.emit(polygonZkEVMContract, 'SetAdmin').withArgs(deployer.address);
        expect(await polygonZkEVMContract.admin()).to.be.equal(deployer.address);
    });

    it('should sequence a batch as truested sequencer', async () => {
        const l2txData = '0x123456';
        const maticAmount = await polygonZkEVMContract.getCurrentBatchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: ethers.BigNumber.from(currentTimestamp),
            minForcedTimestamp: 0,
        };

        // revert because sender is not truested sequencer
        await expect(polygonZkEVMContract.sequenceBatches([sequence]))
            .to.be.revertedWith('PolygonZkEVM::onlyTrustedSequencer: Only trusted sequencer');

        // revert because tokens were not approved
        await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.be.revertedWith('ERC20: insufficient allowance');

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(polygonZkEVMContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await polygonZkEVMContract.lastBatchSequenced();

        // Sequence batch
        await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.emit(polygonZkEVMContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        const sequencedTimestamp = (await ethers.provider.getBlock()).timestamp;

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );
        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );

        // Check batch mapping
        const sequencedBatchData = await polygonZkEVMContract.sequencedBatches(1);
        const batchAccInputHash = sequencedBatchData.accInputHash;

        const batchAccInputHashJs = calculateAccInputHash(
            (await polygonZkEVMContract.sequencedBatches(0)).accInputHash,
            calculateBatchHashData(sequence.transactions),
            sequence.globalExitRoot,
            sequence.timestamp,
            trustedSequencer.address,
        );
        expect(batchAccInputHash).to.be.equal(batchAccInputHashJs);
        expect(sequencedBatchData.sequencedTimestamp).to.be.equal(sequencedTimestamp);
        expect(sequencedBatchData.previousLastBatchSequenced).to.be.equal(0);
    });

    it('sequenceBatches should sequence multiple batches', async () => {
        const l2txData = '0x1234';
        const maticAmount = (await polygonZkEVMContract.getCurrentBatchFee()).mul(2);

        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        const sequence2 = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(polygonZkEVMContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await polygonZkEVMContract.lastBatchSequenced();

        // Sequence batches
        await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.emit(polygonZkEVMContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 2);

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );

        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );

        // Check batch mapping
        const sequencedBatchData = await polygonZkEVMContract.sequencedBatches(1);
        const batchAccInputHash = sequencedBatchData.accInputHash;

        // Only last batch is added to the mapping
        expect(batchAccInputHash).to.be.equal(ethers.constants.HashZero);

        const sequencedBatchData2 = await polygonZkEVMContract.sequencedBatches(2);
        const batchAccInputHash2 = sequencedBatchData2.accInputHash;

        // Calcultate input Hahs for batch 1
        let batchAccInputHashJs = calculateAccInputHash(
            ethers.constants.HashZero,
            calculateBatchHashData(sequence.transactions),
            sequence.globalExitRoot,
            sequence.timestamp,
            trustedSequencer.address,
        );

        // Calcultate input Hahs for batch 2
        batchAccInputHashJs = calculateAccInputHash(
            batchAccInputHashJs,
            calculateBatchHashData(sequence2.transactions),
            sequence2.globalExitRoot,
            sequence2.timestamp,
            trustedSequencer.address,
        );
        expect(batchAccInputHash2).to.be.equal(batchAccInputHashJs);
    });

    it('sequenceBatches should sequence multiple batches and force batches', async () => {
        const l2txDataForceBatch = '0x123456';
        const maticAmount = await polygonZkEVMContract.getCurrentBatchFee();
        const lastGlobalExitRoot = await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(polygonZkEVMContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForcedBatch = (await polygonZkEVMContract.lastForceBatch()) + 1;

        // Force batch
        await expect(polygonZkEVMContract.forceBatch(l2txDataForceBatch, maticAmount))
            .to.emit(polygonZkEVMContract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        // sequence 2 batches
        const l2txData = '0x1234';
        const maticAmountSequence = (await polygonZkEVMContract.getCurrentBatchFee()).mul(1);

        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txDataForceBatch,
            globalExitRoot: lastGlobalExitRoot,
            timestamp: currentTimestamp,
            minForcedTimestamp: currentTimestamp,
        };

        const sequence2 = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(polygonZkEVMContract.address, maticAmountSequence),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await polygonZkEVMContract.lastBatchSequenced();

        // Assert that the timestamp requirements must accomplish with force batches too
        sequence.minForcedTimestamp += 1;
        await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.be.revertedWith('PolygonZkEVM::sequenceBatches: Forced batches data must match');
        sequence.minForcedTimestamp -= 1;

        sequence.timestamp -= 1;
        await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.be.revertedWith('PolygonZkEVM::sequenceBatches: Forced batches timestamp must be bigger or equal than min');
        sequence.timestamp += 1;

        sequence.timestamp = currentTimestamp + 10;
        await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.be.revertedWith('PolygonZkEVM::sequenceBatches: Timestamp must be inside range');
        sequence.timestamp = currentTimestamp;

        sequence2.timestamp -= 1;
        await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.be.revertedWith('PolygonZkEVM::sequenceBatches: Timestamp must be inside range');
        sequence2.timestamp += 1;

        // Sequence Bathces
        await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.emit(polygonZkEVMContract, 'SequenceBatches')
            .withArgs(Number(lastBatchSequenced) + 2);

        const sequencedTimestamp = (await ethers.provider.getBlock()).timestamp;

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );

        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmountSequence)),
        );

        // Check batch mapping
        const batchAccInputHash = (await polygonZkEVMContract.sequencedBatches(1)).accInputHash;
        // Only last batch is added to the mapping
        expect(batchAccInputHash).to.be.equal(ethers.constants.HashZero);

        /*
         * Check batch mapping
         * Calcultate input Hahs for batch 1
         */
        let batchAccInputHashJs = calculateAccInputHash(
            ethers.constants.HashZero,
            calculateBatchHashData(sequence.transactions),
            sequence.globalExitRoot,
            sequence.timestamp,
            trustedSequencer.address,
        );

        // Calcultate input Hahs for batch 2
        batchAccInputHashJs = calculateAccInputHash(
            batchAccInputHashJs,
            calculateBatchHashData(sequence2.transactions),
            sequence2.globalExitRoot,
            sequence2.timestamp,
            trustedSequencer.address,
        );
        const batchData2 = await polygonZkEVMContract.sequencedBatches(2);
        expect(batchData2.accInputHash).to.be.equal(batchAccInputHashJs);
        expect(batchData2.sequencedTimestamp).to.be.equal(sequencedTimestamp);
        expect(batchData2.previousLastBatchSequenced).to.be.equal(0);
    });

    it('sequenceBatches should check the timestamp correctly', async () => {
        const l2txData = '0x';
        const maticAmount = (await polygonZkEVMContract.getCurrentBatchFee()).mul(2);

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: 0,
            minForcedTimestamp: 0,
        };

        const sequence2 = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: 0,
            minForcedTimestamp: 0,
        };

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(polygonZkEVMContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await polygonZkEVMContract.lastBatchSequenced();

        let currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        await ethers.provider.send('evm_increaseTime', [1]); // evm_setNextBlockTimestamp

        sequence.timestamp = currentTimestamp + 2; // bigger than current block tiemstamp

        // revert because timestamp is more than the current one
        await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.be.revertedWith('PolygonZkEVM::sequenceBatches: Timestamp must be inside range');

        currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        await ethers.provider.send('evm_increaseTime', [1]);

        sequence.timestamp = currentTimestamp;
        sequence2.timestamp = currentTimestamp - 1;

        // revert because the second sequence has less timestamp than the previous batch
        await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.be.revertedWith('PolygonZkEVM::sequenceBatches: Timestamp must be inside range');

        currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        await ethers.provider.send('evm_increaseTime', [1]);

        sequence.timestamp = currentTimestamp + 1; // edge case, same timestamp as the block
        sequence2.timestamp = currentTimestamp + 1;

        // Sequence Batches
        await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.emit(polygonZkEVMContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 2);

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.address,
        );
        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );
    });

    it('should force a batch of transactions', async () => {
        const l2txData = '0x123456';
        const maticAmount = await polygonZkEVMContract.getCurrentBatchFee();
        const lastGlobalExitRoot = await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        expect(maticAmount.toString()).to.be.equal((await polygonZkEVMContract.getCurrentBatchFee()).toString());

        // revert because the maxMatic amount is less than the necessary to pay
        await expect(polygonZkEVMContract.forceBatch(l2txData, maticAmount.sub(1)))
            .to.be.revertedWith('PolygonZkEVM::forceBatch: Not enough matic');

        // revert because tokens were not approved
        await expect(polygonZkEVMContract.forceBatch(l2txData, maticAmount))
            .to.be.revertedWith('ERC20: insufficient allowance');

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await deployer.address,
        );
        await expect(
            maticTokenContract.approve(polygonZkEVMContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForceBatch = await polygonZkEVMContract.lastForceBatch();

        // Force batch
        await expect(polygonZkEVMContract.forceBatch(l2txData, maticAmount))
            .to.emit(polygonZkEVMContract, 'ForceBatch')
            .withArgs(lastForceBatch + 1, lastGlobalExitRoot, deployer.address, '0x');

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await deployer.address,
        );
        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );

        // Check force batches struct
        const batchHash = await polygonZkEVMContract.forcedBatches(1);
        const timestampForceBatch = (await ethers.provider.getBlock()).timestamp;

        const batchHashJs = ethers.utils.solidityKeccak256(
            ['bytes32', 'bytes32', 'uint64'],
            [
                calculateBatchHashData(l2txData),
                lastGlobalExitRoot,
                timestampForceBatch,
            ],
        );
        expect(batchHashJs).to.be.equal(batchHash);
    });

    it('should sequence force batches using sequenceForceBatches', async () => {
        const l2txData = '0x123456';
        const maticAmount = await polygonZkEVMContract.getCurrentBatchFee();
        const lastGlobalExitRoot = await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(polygonZkEVMContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForcedBatch = (await polygonZkEVMContract.lastForceBatch()) + 1;

        await expect(polygonZkEVMContract.forceBatch(l2txData, maticAmount))
            .to.emit(polygonZkEVMContract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        const timestampForceBatch = (await ethers.provider.getBlock()).timestamp;

        const forceBatchHash = await polygonZkEVMContract.forcedBatches(1);

        const batchHashJs = ethers.utils.solidityKeccak256(
            ['bytes32', 'bytes32', 'uint64'],
            [
                calculateBatchHashData(l2txData),
                lastGlobalExitRoot,
                timestampForceBatch,
            ],
        );
        expect(batchHashJs).to.be.equal(forceBatchHash);

        // Check storage variables before call
        expect(await polygonZkEVMContract.lastForceBatchSequenced()).to.be.equal(0);
        expect(await polygonZkEVMContract.lastForceBatch()).to.be.equal(1);
        expect(await polygonZkEVMContract.lastBatchSequenced()).to.be.equal(0);

        const forceBatchStruct = {
            transactions: l2txData,
            globalExitRoot: lastGlobalExitRoot,
            minForcedTimestamp: timestampForceBatch,
        };

        // revert because the timeout is not expired
        await expect(polygonZkEVMContract.sequenceForceBatches([]))
            .to.be.revertedWith('PolygonZkEVM::sequenceForceBatches: Must force at least 1 batch');

        // revert because the timeout is not expired
        await expect(polygonZkEVMContract.sequenceForceBatches([forceBatchStruct]))
            .to.be.revertedWith('PolygonZkEVM::sequenceForceBatches: Forced batch is not in timeout period');

        // Increment timestamp
        const forceBatchTimeout = await polygonZkEVMContract.FORCE_BATCH_TIMEOUT();
        await ethers.provider.send('evm_setNextBlockTimestamp', [timestampForceBatch + forceBatchTimeout.toNumber()]);

        // sequence force batch
        await expect(polygonZkEVMContract.sequenceForceBatches([forceBatchStruct]))
            .to.emit(polygonZkEVMContract, 'SequenceForceBatches')
            .withArgs(1);

        const timestampSequenceBatch = (await ethers.provider.getBlock()).timestamp;

        expect(await polygonZkEVMContract.lastForceBatchSequenced()).to.be.equal(1);
        expect(await polygonZkEVMContract.lastForceBatch()).to.be.equal(1);
        expect(await polygonZkEVMContract.lastBatchSequenced()).to.be.equal(1);

        // Check force batches struct
        const batchAccInputHash = (await polygonZkEVMContract.sequencedBatches(1)).accInputHash;

        const batchAccInputHashJs = calculateAccInputHash(
            ethers.constants.HashZero,
            calculateBatchHashData(l2txData),
            lastGlobalExitRoot,
            timestampSequenceBatch,
            deployer.address,
        );
        expect(batchAccInputHash).to.be.equal(batchAccInputHashJs);
    });

    it('should verify a sequenced batch using trustedVerifyBatches', async () => {
        const l2txData = '0x123456';
        const maticAmount = await polygonZkEVMContract.getCurrentBatchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(polygonZkEVMContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await polygonZkEVMContract.lastBatchSequenced();
        // Sequence Batches
        await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.emit(polygonZkEVMContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        // trustedAggregator forge the batch
        const pendingState = 0;
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const numBatch = (await polygonZkEVMContract.lastVerifiedBatch()) + 1;
        const proofA = ['0', '0'];
        const proofB = [
            ['0', '0'],
            ['0', '0'],
        ];
        const proofC = ['0', '0'];

        const initialAggregatorMatic = await maticTokenContract.balanceOf(
            trustedAggregator.address,
        );

        await expect(
            polygonZkEVMContract.connect(deployer).trustedVerifyBatches(
                pendingState,
                numBatch - 1,
                numBatch - 1,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.be.revertedWith('PolygonZkEVM::onlyTrustedAggregator: Only trusted aggregator');

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).trustedVerifyBatches(
                pendingState,
                numBatch - 1,
                numBatch - 1,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.be.revertedWith('PolygonZkEVM::_verifyBatches: finalNewBatch must be bigger than currentLastVerifiedBatch');

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).trustedVerifyBatches(
                pendingState,
                numBatch - 1,
                numBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.be.revertedWith('PolygonZkEVM::getInputSnarkBytes: newAccInputHash does not exist');

        // Verify batch
        await expect(
            polygonZkEVMContract.connect(trustedAggregator).trustedVerifyBatches(
                pendingState,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.emit(polygonZkEVMContract, 'TrustedVerifyBatches')
            .withArgs(numBatch, newStateRoot, trustedAggregator.address);

        const finalAggregatorMatic = await maticTokenContract.balanceOf(
            trustedAggregator.address,
        );
        expect(finalAggregatorMatic).to.equal(
            ethers.BigNumber.from(initialAggregatorMatic).add(ethers.BigNumber.from(maticAmount)),
        );
    });

    it('should verify forced sequenced batch using trustedVerifyBatches', async () => {
        const l2txData = '0x123456';
        const maticAmount = await polygonZkEVMContract.getCurrentBatchFee();
        const lastGlobalExitRoot = await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(polygonZkEVMContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForcedBatch = (await polygonZkEVMContract.lastForceBatch()) + 1;
        await expect(polygonZkEVMContract.forceBatch(l2txData, maticAmount))
            .to.emit(polygonZkEVMContract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        const timestampForceBatch = (await ethers.provider.getBlock()).timestamp;
        // Increment timestamp
        const forceBatchTimeout = await polygonZkEVMContract.FORCE_BATCH_TIMEOUT();
        await ethers.provider.send('evm_setNextBlockTimestamp', [timestampForceBatch + forceBatchTimeout.toNumber()]);

        const forceBatchStruct = {
            transactions: l2txData,
            globalExitRoot: lastGlobalExitRoot,
            minForcedTimestamp: timestampForceBatch,
        };

        // sequence force batch
        await expect(polygonZkEVMContract.sequenceForceBatches([forceBatchStruct]))
            .to.emit(polygonZkEVMContract, 'SequenceForceBatches')
            .withArgs(lastForcedBatch);

        // trustedAggregator forge the batch
        const pendingState = 0;
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const numBatch = (await polygonZkEVMContract.lastVerifiedBatch()) + 1;
        const proofA = ['0', '0'];
        const proofB = [
            ['0', '0'],
            ['0', '0'],
        ];
        const proofC = ['0', '0'];

        const initialAggregatorMatic = await maticTokenContract.balanceOf(
            trustedAggregator.address,
        );

        // Verify batch
        await expect(
            polygonZkEVMContract.connect(trustedAggregator).trustedVerifyBatches(
                pendingState,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.emit(polygonZkEVMContract, 'VerifyBatch')
            .withArgs(numBatch, trustedAggregator.address)
            .to.emit(maticTokenContract, 'Transfer')
            .withArgs(polygonZkEVMContract.address, trustedAggregator.address, maticAmount);

        const finalAggregatorMatic = await maticTokenContract.balanceOf(
            trustedAggregator.address,
        );

        expect(finalAggregatorMatic).to.equal(
            ethers.BigNumber.from(initialAggregatorMatic).add(ethers.BigNumber.from(maticAmount)),
        );
    });

    it('should match the computed SC input with the Js input', async () => {
        const l2txData = '0x123456';
        const maticAmount = await polygonZkEVMContract.getCurrentBatchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(polygonZkEVMContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await polygonZkEVMContract.lastBatchSequenced();

        // Sequence
        await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.emit(polygonZkEVMContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        const sentBatchHash = (await polygonZkEVMContract.sequencedBatches(lastBatchSequenced + 1)).accInputHash;
        const oldAccInputHash = (await polygonZkEVMContract.sequencedBatches(0)).accInputHash;

        const batchAccInputHashJs = calculateAccInputHash(
            oldAccInputHash,
            calculateBatchHashData(sequence.transactions),
            sequence.globalExitRoot,
            sequence.timestamp,
            trustedSequencer.address,
        );
        expect(sentBatchHash).to.be.equal(batchAccInputHashJs);

        // Compute circuit input with the SC function
        const currentStateRoot = await polygonZkEVMContract.batchNumToStateRoot(0);
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000001234';
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000456';
        const numBatch = (await polygonZkEVMContract.lastVerifiedBatch()) + 1;

        // Compute Js input
        const inputSnarkJS = await calculateSnarkInput(
            currentStateRoot,
            newStateRoot,
            newLocalExitRoot,
            oldAccInputHash,
            batchAccInputHashJs,
            numBatch - 1,
            numBatch,
            chainID,
            deployer.address,
        );

        // Compute Js input
        const pendingStateNum = 0;
        const circuitInpuSnarkSC = await polygonZkEVMContract.getNextSnarkInput(
            pendingStateNum,
            numBatch - 1,
            numBatch,
            newLocalExitRoot,
            newStateRoot,
        );

        expect(circuitInpuSnarkSC).to.be.equal(inputSnarkJS);
    });

    it('should match the computed SC input with the Js input in force batches', async () => {
        const l2txData = '0x123456';
        const maticAmount = await polygonZkEVMContract.getCurrentBatchFee();
        const lastGlobalExitRoot = await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(polygonZkEVMContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForcedBatch = (await polygonZkEVMContract.lastForceBatch()).toNumber() + 1;
        await expect(polygonZkEVMContract.forceBatch(l2txData, maticAmount))
            .to.emit(polygonZkEVMContract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        const timestampForceBatch = (await ethers.provider.getBlock()).timestamp;

        // Increment timestamp
        const forceBatchTimeout = await polygonZkEVMContract.FORCE_BATCH_TIMEOUT();
        await ethers.provider.send('evm_setNextBlockTimestamp', [timestampForceBatch + forceBatchTimeout.toNumber()]);

        const forceBatchStruct = {
            transactions: l2txData,
            globalExitRoot: lastGlobalExitRoot,
            minForcedTimestamp: timestampForceBatch,
        };

        // sequence force batch
        await expect(polygonZkEVMContract.sequenceForceBatches([forceBatchStruct]))
            .to.emit(polygonZkEVMContract, 'SequenceForceBatches')
            .withArgs(lastForcedBatch);

        const sequencedTimestmap = (await ethers.provider.getBlock()).timestamp;
        const oldAccInputHash = (await polygonZkEVMContract.sequencedBatches(0)).accInputHash;
        const batchAccInputHash = (await polygonZkEVMContract.sequencedBatches(1)).accInputHash;

        const batchAccInputHashJs = calculateAccInputHash(
            oldAccInputHash,
            calculateBatchHashData(l2txData),
            lastGlobalExitRoot,
            sequencedTimestmap,
            deployer.address,
        );
        expect(batchAccInputHash).to.be.equal(batchAccInputHashJs);

        // Compute circuit input with the SC function
        const currentStateRoot = await polygonZkEVMContract.batchNumToStateRoot(0);
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000001234';
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000456';
        const numBatch = (await polygonZkEVMContract.lastVerifiedBatch()) + 1;

        // Compute Js input
        const inputSnarkJS = await calculateSnarkInput(
            currentStateRoot,
            newStateRoot,
            newLocalExitRoot,
            oldAccInputHash,
            batchAccInputHashJs,
            numBatch - 1,
            numBatch,
            chainID,
            deployer.address,
        );

        // Compute Js input
        const pendingStateNum = 0;
        const circuitInpuSnarkSC = await polygonZkEVMContract.getNextSnarkInput(
            pendingStateNum,
            numBatch - 1,
            numBatch,
            newLocalExitRoot,
            newStateRoot,
        );

        expect(circuitInpuSnarkSC).to.be.equal(inputSnarkJS);
    });

    it('should verify a sequenced batch using verifyBatches', async () => {
        const l2txData = '0x123456';
        const maticAmount = await polygonZkEVMContract.getCurrentBatchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(polygonZkEVMContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await polygonZkEVMContract.lastBatchSequenced();
        // Sequence Batches
        await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.emit(polygonZkEVMContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        // aggregator forge the batch
        const pendingState = 0;
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000002';
        const numBatch = (await polygonZkEVMContract.lastVerifiedBatch()) + 1;
        const proofA = ['0', '0'];
        const proofB = [
            ['0', '0'],
            ['0', '0'],
        ];
        const proofC = ['0', '0'];

        const initialAggregatorMatic = await maticTokenContract.balanceOf(
            aggregator1.address,
        );

        const sequencedBatchData = await polygonZkEVMContract.sequencedBatches(1);
        const { sequencedTimestamp } = sequencedBatchData;
        const currentBatchFee = await polygonZkEVMContract.batchFee();

        await expect(
            polygonZkEVMContract.connect(aggregator1).verifyBatches(
                pendingState,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.be.revertedWith('PolygonZkEVM::verifyBatches: Trusted aggregator timeout not expired');

        await ethers.provider.send('evm_setNextBlockTimestamp', [sequencedTimestamp.toNumber() + trustedAggregatorTimeoutDefault - 1]);

        await expect(
            polygonZkEVMContract.connect(aggregator1).verifyBatches(
                pendingState,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.be.revertedWith('PolygonZkEVM::verifyBatches: Trusted aggregator timeout not expired');

        await expect(
            polygonZkEVMContract.connect(aggregator1).verifyBatches(
                pendingState,
                numBatch - 1,
                numBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.be.revertedWith('PolygonZkEVM::getInputSnarkBytes: newAccInputHash does not exist');

        // Verify batch
        await expect(
            polygonZkEVMContract.connect(aggregator1).verifyBatches(
                pendingState,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.emit(polygonZkEVMContract, 'VerifyBatches')
            .withArgs(numBatch, newStateRoot, aggregator1.address);

        const verifyTimestamp = (await ethers.provider.getBlock()).timestamp;

        const finalAggregatorMatic = await maticTokenContract.balanceOf(
            aggregator1.address,
        );
        expect(finalAggregatorMatic).to.equal(
            ethers.BigNumber.from(initialAggregatorMatic).add(ethers.BigNumber.from(maticAmount)),
        );

        // Check pending state
        const lastPendingstate = 1;
        expect(lastPendingstate).to.be.equal(await polygonZkEVMContract.lastPendingState());

        const pendingStateData = await polygonZkEVMContract.pendingStateTransitions(lastPendingstate);
        expect(verifyTimestamp).to.be.equal(pendingStateData.timestamp);
        expect(numBatch).to.be.equal(pendingStateData.lastVerifiedBatch);
        expect(newLocalExitRoot).to.be.equal(pendingStateData.exitRoot);
        expect(newStateRoot).to.be.equal(pendingStateData.stateRoot);

        // Try consolidate state
        expect(0).to.be.equal(await polygonZkEVMContract.lastVerifiedBatch());

        // Pending state can't be 0
        await expect(
            polygonZkEVMContract.consolidatePendingState(0),
        ).to.be.revertedWith('PolygonZkEVM::_consolidatePendingState: pendingStateNum invalid');

        // Pending state does not exist
        await expect(
            polygonZkEVMContract.consolidatePendingState(2),
        ).to.be.revertedWith('PolygonZkEVM::_consolidatePendingState: pendingStateNum invalid');

        // Not ready to be consolidated
        await expect(
            polygonZkEVMContract.consolidatePendingState(lastPendingstate),
        ).to.be.revertedWith('PolygonZkEVM::consolidatePendingState: Pending state is not ready to be consolidated');

        await ethers.provider.send('evm_setNextBlockTimestamp', [verifyTimestamp + pendingStateTimeoutDefault - 1]);

        await expect(
            polygonZkEVMContract.consolidatePendingState(lastPendingstate),
        ).to.be.revertedWith('PolygonZkEVM::consolidatePendingState: Pending state is not ready to be consolidated');

        await expect(
            polygonZkEVMContract.consolidatePendingState(lastPendingstate),
        ).to.emit(polygonZkEVMContract, 'ConsolidatePendingState')
            .withArgs(numBatch, newStateRoot, lastPendingstate);

        // Pending state already consolidated
        await expect(
            polygonZkEVMContract.consolidatePendingState(1),
        ).to.be.revertedWith('PolygonZkEVM::_consolidatePendingState: pendingStateNum invalid');

        // Fee es divided because is was fast verified
        const multiplierFee = await polygonZkEVMContract.multiplierBatchFee();
        expect((currentBatchFee.mul(1000)).div(multiplierFee)).to.be.equal(await polygonZkEVMContract.batchFee());

        // Check pending state variables
        expect(1).to.be.equal(await polygonZkEVMContract.lastVerifiedBatch());
        expect(newStateRoot).to.be.equal(await polygonZkEVMContract.batchNumToStateRoot(1));
        expect(1).to.be.equal(await polygonZkEVMContract.lastPendingStateConsolidated());
    });
});
