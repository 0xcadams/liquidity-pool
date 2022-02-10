import { ethers } from 'hardhat';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import {
  SpaceCoin,
  SpaceCoinETHPair,
  SpaceCoin__factory as SpaceCoinFactory,
  SpaceCoinETHPair__factory as SpaceCoinETHPairFactory,
  SpaceRouter
} from '../frontend/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

chai.use(chaiAsPromised);
const { expect } = chai;

const contributionAmountTwentyEther = ethers.utils.parseEther('20');
const contributionAmountOneEther = ethers.utils.parseEther('1');

const fiveTokensAmount = ethers.BigNumber.from(5).mul(ethers.BigNumber.from(10).pow(18));

const twoToOneSpc = contributionAmountOneEther.mul(5).mul(2);

describe('SpaceCoinRouter: Remove Liquidity', () => {
  let spaceCoinOwner: SpaceCoin;
  let spaceCoinProvider: SpaceCoin;

  let spaceRouterOwner: SpaceRouter;
  let spaceRouterProvider: SpaceRouter;

  let spaceCoinEthPairOwner: SpaceCoinETHPair;
  let spaceCoinEthPairProvider: SpaceCoinETHPair;

  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let provider: SignerWithAddress;

  beforeEach(async () => {
    [owner, treasury, provider] = await ethers.getSigners();

    const SpaceCoinICO = await ethers.getContractFactory('SpaceCoinICO');
    const spaceCoinICOOwner = await SpaceCoinICO.deploy(treasury.address);

    const spaceCoinAddress = await spaceCoinICOOwner.spaceCoin();

    spaceCoinOwner = SpaceCoinFactory.connect(spaceCoinAddress, owner);
    spaceCoinProvider = spaceCoinOwner.connect(provider);

    const SpaceRouter = await ethers.getContractFactory('SpaceRouter');
    spaceRouterOwner = await SpaceRouter.deploy(spaceCoinAddress);

    spaceRouterProvider = spaceRouterOwner.connect(provider);

    const spaceCoinEthPairAddress = await spaceRouterProvider.spaceCoinEthPair();
    spaceCoinEthPairOwner = SpaceCoinETHPairFactory.connect(spaceCoinEthPairAddress, owner);
    spaceCoinEthPairProvider = spaceCoinEthPairOwner.connect(provider);

    // await spaceCoinICOOwner.toggleTaxEnabled();

    // increment to Phase General
    await spaceCoinICOOwner.incrementPhase();
    // increment to Phase Open
    await spaceCoinICOOwner.incrementPhase();

    await spaceCoinICOOwner.connect(provider).invest({
      value: contributionAmountTwentyEther
    });

    await spaceCoinProvider.approve(spaceRouterProvider.address, twoToOneSpc);

    await spaceRouterProvider.addLiquidity(twoToOneSpc, provider.address, {
      value: contributionAmountOneEther
    });
  });

  describe('router functions correctly (happy paths)', async () => {
    it('should remove liquidity for a provider', async () => {
      await expect(
        spaceCoinEthPairProvider.approve(
          spaceRouterProvider.address,
          await spaceCoinEthPairProvider.balanceOf(provider.address)
        )
      ).to.emit(spaceCoinEthPairProvider, 'Approval');

      const initialSpcBalance = await spaceCoinProvider.balanceOf(provider.address);

      expect(
        await spaceRouterProvider.removeLiquidity(
          await spaceCoinEthPairOwner.balanceOf(provider.address),
          provider.address
        )
      ).to.emit(spaceCoinEthPairOwner, 'Transfer');

      // expect similar final balance, with loss due to MINIMUM_LIQUIDITY
      expect(await spaceCoinProvider.balanceOf(provider.address)).to.be.closeTo(
        initialSpcBalance.add(twoToOneSpc),
        5000
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
