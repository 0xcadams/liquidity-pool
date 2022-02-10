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
import { BigNumber } from 'ethers';

chai.use(chaiAsPromised);
const { expect } = chai;

const contributionAmountTwentyEther = ethers.utils.parseEther('20');
const contributionAmountOneEther = ethers.utils.parseEther('1');

const fiveTokensAmount = ethers.BigNumber.from(5).mul(ethers.BigNumber.from(10).pow(18));

const twoToOneSpc = contributionAmountOneEther.mul(5).mul(2);

describe('SpaceCoinRouter: Add Liquidity', () => {
  let spaceCoinOwner: SpaceCoin;
  let spaceCoinProvider: SpaceCoin;
  let spaceCoinProvider2: SpaceCoin;

  let spaceRouterOwner: SpaceRouter;
  let spaceRouterProvider: SpaceRouter;
  let spaceRouterProvider2: SpaceRouter;

  let spaceCoinEthPairOwner: SpaceCoinETHPair;

  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let provider: SignerWithAddress;
  let provider2: SignerWithAddress;

  beforeEach(async () => {
    [owner, treasury, provider, provider2] = await ethers.getSigners();

    const SpaceCoinICO = await ethers.getContractFactory('SpaceCoinICO');
    const spaceCoinICOOwner = await SpaceCoinICO.deploy(treasury.address);

    const spaceCoinAddress = await spaceCoinICOOwner.spaceCoin();

    spaceCoinOwner = SpaceCoinFactory.connect(spaceCoinAddress, owner);
    spaceCoinProvider = spaceCoinOwner.connect(provider);
    spaceCoinProvider2 = spaceCoinOwner.connect(provider2);

    const SpaceRouter = await ethers.getContractFactory('SpaceRouter');
    spaceRouterOwner = await SpaceRouter.deploy(spaceCoinAddress);

    spaceRouterProvider = spaceRouterOwner.connect(provider);
    spaceRouterProvider2 = spaceRouterOwner.connect(provider2);

    const spaceCoinEthPairAddress = await spaceRouterProvider.spaceCoinEthPair();
    spaceCoinEthPairOwner = SpaceCoinETHPairFactory.connect(spaceCoinEthPairAddress, owner);

    // await spaceCoinICOOwner.toggleTaxEnabled();

    // increment to Phase General
    await spaceCoinICOOwner.incrementPhase();
    // increment to Phase Open
    await spaceCoinICOOwner.incrementPhase();

    await spaceCoinICOOwner.connect(provider).invest({
      value: contributionAmountTwentyEther
    });
    await spaceCoinICOOwner.connect(provider2).invest({
      value: contributionAmountTwentyEther
    });
  });

  describe('router functions correctly (happy paths)', async () => {
    it('should add liquidity for a provider', async () => {
      await expect(spaceCoinProvider.approve(spaceRouterProvider.address, twoToOneSpc)).to.emit(
        spaceCoinProvider,
        'Approval'
      );

      await expect(
        spaceRouterProvider.addLiquidity(twoToOneSpc, provider.address, {
          value: contributionAmountOneEther
        })
      ).to.not.be.reverted;

      expect(await spaceCoinEthPairOwner.currentEthBalance()).to.equal(contributionAmountOneEther);
      expect(await spaceCoinOwner.balanceOf(spaceCoinEthPairOwner.address)).to.equal(twoToOneSpc);

      expect(
        await spaceCoinEthPairOwner.balanceOf('0xdEAD000000000000000042069420694206942069')
      ).to.equal(await spaceCoinEthPairOwner.MINIMUM_LIQUIDITY());

      // from https://github.com/ethers-io/ethers.js/issues/1182
      const sqrt = (value: BigNumber) => {
        const x = value;
        let z = x.add(ethers.BigNumber.from(1)).div(ethers.BigNumber.from(2));
        let y = x;
        while (z.sub(y).isNegative()) {
          y = z;
          z = x.div(z).add(z).div(ethers.BigNumber.from(2));
        }
        return y;
      };

      expect(await spaceCoinEthPairOwner.balanceOf(provider.address)).to.equal(
        sqrt(contributionAmountOneEther.mul(twoToOneSpc)).sub(
          await spaceCoinEthPairOwner.MINIMUM_LIQUIDITY()
        )
      );

      // SECOND LIQUIDITY ADDITION
      await spaceCoinProvider2.approve(spaceRouterProvider2.address, contributionAmountOneEther);

      await spaceRouterProvider2.addLiquidity(contributionAmountOneEther, provider2.address, {
        value: contributionAmountOneEther.div(10)
      });

      expect(await spaceCoinEthPairOwner.balanceOf(provider2.address)).to.equal(
        BigNumber.from('316227766016837933')
      );
    });

    it('should be able to send too much ETH and get back some ETH', async () => {
      await expect(spaceCoinProvider.approve(spaceRouterProvider.address, twoToOneSpc)).to.emit(
        spaceCoinProvider,
        'Approval'
      );

      await expect(
        spaceRouterProvider.addLiquidity(twoToOneSpc, provider.address, {
          value: contributionAmountOneEther
        })
      ).to.not.be.reverted;

      // SECOND LIQUIDITY ADDITION WITH WAY TOO MUCH ETHER
      await spaceCoinProvider2.approve(spaceRouterProvider2.address, contributionAmountOneEther);

      await expect(
        spaceRouterProvider2.addLiquidity(contributionAmountOneEther, provider2.address, {
          // multiplying by 10, which is WAY too much ether for the optimal ratio
          value: contributionAmountOneEther.mul(10)
        })
      ).to.not.be.reverted;

      const finalReserves = await spaceCoinEthPairOwner.getReserves();

      // expect the total of all values added so far (with some ETH refunded back)
      await expect(finalReserves[0]).to.equal(twoToOneSpc.add(contributionAmountOneEther));
      await expect(finalReserves[1]).to.equal(
        contributionAmountOneEther.div(10).add(contributionAmountOneEther)
      );
    });

    it('should be able to send too much SPC and get back some SPC', async () => {
      await expect(spaceCoinProvider.approve(spaceRouterProvider.address, twoToOneSpc)).to.emit(
        spaceCoinProvider,
        'Approval'
      );

      await expect(
        spaceRouterProvider.addLiquidity(twoToOneSpc, provider.address, {
          value: contributionAmountOneEther
        })
      ).to.not.be.reverted;

      // SECOND LIQUIDITY ADDITION WITH WAY TOO MUCH SPC
      await spaceCoinProvider2.approve(spaceRouterProvider2.address, contributionAmountOneEther);

      await expect(
        // multiplying by 30, which is WAY too much ether for the optimal ratio (and too much for the above approve())
        spaceRouterProvider2.addLiquidity(contributionAmountOneEther.mul(30), provider2.address, {
          value: contributionAmountOneEther.div(10)
        })
      ).to.not.be.reverted;

      const finalReserves = await spaceCoinEthPairOwner.getReserves();

      // expect the total of all values added so far (with some ETH refunded back)
      await expect(finalReserves[0]).to.equal(twoToOneSpc.add(contributionAmountOneEther));
      await expect(finalReserves[1]).to.equal(
        contributionAmountOneEther.div(10).add(contributionAmountOneEther)
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
