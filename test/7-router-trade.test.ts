import { ethers } from 'hardhat';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import {
  SpaceCoin,
  SpaceCoinETHPair,
  SpaceCoin__factory as SpaceCoinFactory,
  SpaceCoinETHPair__factory as SpaceCoinETHPairFactory,
  SpaceRouter,
  SpaceCoinICO
} from '../frontend/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

chai.use(chaiAsPromised);
const { expect } = chai;

const TWENTY_ETHER = ethers.utils.parseEther('20');
const ONE_HUNDREDTH_ETHER = ethers.utils.parseEther('0.01');

const fiveTokensAmount = ethers.BigNumber.from(5).mul(ethers.BigNumber.from(10).pow(18));

describe('SpaceCoinRouter: Trade', () => {
  let spaceCoinICOOwner: SpaceCoinICO;

  let spaceCoinOwner: SpaceCoin;
  let spaceCoinProvider: SpaceCoin;

  let spaceRouterOwner: SpaceRouter;
  let spaceRouterProvider: SpaceRouter;
  let spaceRouterTrader: SpaceRouter;

  let spaceCoinEthPairOwner: SpaceCoinETHPair;
  let spaceCoinEthPairProvider: SpaceCoinETHPair;

  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let provider: SignerWithAddress;
  let trader: SignerWithAddress;

  beforeEach(async () => {
    [owner, treasury, provider, trader] = await ethers.getSigners();

    const SpaceCoinICO = await ethers.getContractFactory('SpaceCoinICO');
    spaceCoinICOOwner = await SpaceCoinICO.deploy(treasury.address);

    const spaceCoinAddress = await spaceCoinICOOwner.spaceCoin();

    spaceCoinOwner = SpaceCoinFactory.connect(spaceCoinAddress, owner);
    spaceCoinProvider = spaceCoinOwner.connect(provider);
    const spaceCoinTrader = spaceCoinOwner.connect(trader);

    const SpaceRouter = await ethers.getContractFactory('SpaceRouter');
    spaceRouterOwner = await SpaceRouter.deploy(spaceCoinAddress);

    spaceRouterProvider = spaceRouterOwner.connect(provider);
    spaceRouterTrader = spaceRouterOwner.connect(trader);

    const spaceCoinEthPairAddress = await spaceRouterProvider.spaceCoinEthPair();
    spaceCoinEthPairOwner = SpaceCoinETHPairFactory.connect(spaceCoinEthPairAddress, owner);
    spaceCoinEthPairProvider = spaceCoinEthPairOwner.connect(provider);

    // increment to Phase General
    await spaceCoinICOOwner.incrementPhase();
    // increment to Phase Open
    await spaceCoinICOOwner.incrementPhase();

    await spaceCoinICOOwner.connect(provider).invest({
      value: TWENTY_ETHER.mul(30)
    });

    // approve all SPC transfers for provider
    await spaceCoinProvider.approve(
      spaceRouterProvider.address,
      await spaceCoinProvider.balanceOf(provider.address)
    );

    await spaceRouterProvider.addLiquidity(TWENTY_ETHER.mul(5).mul(5), provider.address, {
      value: TWENTY_ETHER.mul(5)
    });

    await spaceCoinICOOwner.connect(trader).invest({
      value: TWENTY_ETHER
    });

    // approve all SPC transfers for trader
    await spaceCoinTrader.approve(
      spaceRouterProvider.address,
      await spaceCoinProvider.balanceOf(trader.address)
    );
  });

  describe('router functions correctly (happy paths)', async () => {
    it('should be able to trade ETH->SPC for trader', async () => {
      const originalBalance = await spaceCoinOwner.balanceOf(trader.address);

      await expect(
        spaceRouterTrader.swapETHForSPC(0, trader.address, { value: ONE_HUNDREDTH_ETHER })
      ).to.emit(spaceCoinOwner, 'Transfer');

      // fees
      expect((await spaceCoinOwner.balanceOf(trader.address)).sub(originalBalance)).to.be.closeTo(
        ethers.utils.parseEther('0.049'),
        ethers.utils.parseEther('0.0005').toNumber()
      );
      expect(await spaceCoinEthPairProvider.balanceOf(trader.address)).to.equal(0);
    });

    it('should be able to trade SPC->ETH for trader', async () => {
      const originalBalance = await treasury.getBalance();

      await expect(
        spaceRouterTrader.swapSPCForETH(ONE_HUNDREDTH_ETHER.mul(5), 0, treasury.address)
      ).to.emit(spaceCoinOwner, 'Transfer');

      // fees
      expect((await treasury.getBalance()).sub(originalBalance)).to.be.closeTo(
        ethers.utils.parseEther('0.00989'),
        ethers.utils.parseEther('0.00005').toNumber()
      );
      expect(await spaceCoinEthPairProvider.balanceOf(trader.address)).to.equal(0);
    });

    it('should be able to trade ETH->SPC for trader w/ tax', async () => {
      await spaceCoinICOOwner.toggleTaxEnabled();

      const originalBalance = await spaceCoinOwner.balanceOf(trader.address);

      await expect(
        spaceRouterTrader.swapETHForSPC(0, trader.address, { value: ONE_HUNDREDTH_ETHER })
      ).to.emit(spaceCoinOwner, 'Transfer');

      // fees + taxes
      expect((await spaceCoinOwner.balanceOf(trader.address)).sub(originalBalance)).to.be.closeTo(
        ethers.utils.parseEther('0.0485'),
        ethers.utils.parseEther('0.00001').toNumber()
      );
      expect(await spaceCoinEthPairProvider.balanceOf(trader.address)).to.equal(0);
    });

    it('should be able to trade SPC->ETH w/ tax', async () => {
      await spaceCoinICOOwner.toggleTaxEnabled();

      const originalBalance = await treasury.getBalance();

      await expect(
        spaceRouterTrader.swapSPCForETH(ONE_HUNDREDTH_ETHER, 0, treasury.address)
      ).to.emit(spaceCoinOwner, 'Transfer');

      // fees + taxes
      expect((await treasury.getBalance()).sub(originalBalance)).to.be.closeTo(
        ethers.utils.parseEther('0.00194'),
        ethers.utils.parseEther('0.00005').toNumber()
      );
      expect(await spaceCoinEthPairProvider.balanceOf(treasury.address)).to.equal(0);
    });
  });

  describe('router functions correctly (sad paths)', async () => {
    it('should fail to trade ETH->SPC when slippage occurs', async () => {
      await expect(
        spaceRouterTrader.swapETHForSPC(ethers.utils.parseEther('0.09'), trader.address, {
          value: ONE_HUNDREDTH_ETHER
        })
      ).to.be.revertedWith('Insufficient output amount');
    });

    it('should fail to trade SPC->ETH when slippage occurs', async () => {
      await expect(
        spaceRouterTrader.swapSPCForETH(
          ONE_HUNDREDTH_ETHER.mul(5),
          ethers.utils.parseEther('0.01'),
          treasury.address
        )
      ).to.be.revertedWith('Insufficient output amount');
    });
  });
});
