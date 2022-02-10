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
const ONE_ETHER = ethers.utils.parseEther('1');

const fiveTokensAmount = ethers.BigNumber.from(5).mul(ethers.BigNumber.from(10).pow(18));

describe('SpaceCoinRouter: Owner Withdraw from ICO', () => {
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
  });

  describe('router functions correctly (happy paths)', async () => {
    it('should be able move to liquidity pool', async () => {
      // approve all SPC transfers for provider
      await spaceCoinOwner.approve(
        spaceRouterProvider.address,
        await spaceCoinOwner.balanceOf(provider.address)
      );

      await spaceCoinICOOwner.moveToLiquidityPool(ONE_ETHER.div(5), spaceRouterOwner.address);

      const ownerSPCETHBalance = await spaceCoinEthPairOwner.balanceOf(owner.address);

      expect(ownerSPCETHBalance).to.be.closeTo(
        ethers.utils.parseEther('0.447'),
        ethers.utils.parseEther('0.001').toNumber()
      );

      await spaceCoinEthPairOwner.approve(spaceRouterOwner.address, ownerSPCETHBalance);

      expect(await spaceRouterOwner.removeLiquidity(ownerSPCETHBalance, owner.address)).to.emit(
        spaceCoinOwner,
        'Transfer'
      );
    });
  });

  describe('router functions correctly (sad paths)', async () => {
    // it('should fail to withdraw if amount is too high and performed in multiple calls', async () => {
    //   await incrementPhaseToOpen();
    //   await spaceCoinICOGeneralProvider.invest({
    //     value: contributionAmountOneEther
    //   });
    //   await expect(spaceCoinICOOwner.withdraw(contributionAmountOneEther.div(2))).to.not.be
    //     .reverted;
    //   await expect(
    //     spaceCoinICOOwner.withdraw(contributionAmountOneEther.div(2).add(1))
    //   ).to.be.revertedWith('Withdrawal amount not available');
    // });
  });
});
