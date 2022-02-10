import { ethers } from 'hardhat';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { SpaceCoin, SpaceCoinICO, SpaceCoin__factory as SpaceCoinFactory } from '../frontend/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber } from 'ethers';

chai.use(chaiAsPromised);
const { expect } = chai;

const goalValue = ethers.utils.parseEther('30000');

const contributionAmountOneEther = ethers.utils.parseEther('1');
const contributionAmountLarge = ethers.utils.parseEther('2000');

const fiveTokensAmount = ethers.BigNumber.from(5).mul(ethers.BigNumber.from(10).pow(18));

describe('SpaceCoinICO: Phase Open', () => {
  let spaceCoinICOOwner: SpaceCoinICO;
  let spaceCoinICOTreasury: SpaceCoinICO;
  let spaceCoinICOPrivateInvestor: SpaceCoinICO;
  let spaceCoinICOGeneralContributor: SpaceCoinICO;

  let spaceCoin: SpaceCoin;

  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let privateInvestor: SignerWithAddress;
  let generalContributor: SignerWithAddress;

  beforeEach(async () => {
    [owner, treasury, privateInvestor, generalContributor] = await ethers.getSigners();

    const SpaceCoinICO = await ethers.getContractFactory('SpaceCoinICO');
    spaceCoinICOOwner = await SpaceCoinICO.deploy(treasury.address);

    spaceCoinICOTreasury = spaceCoinICOOwner.connect(treasury);
    spaceCoinICOPrivateInvestor = spaceCoinICOOwner.connect(privateInvestor);
    spaceCoinICOGeneralContributor = spaceCoinICOOwner.connect(generalContributor);

    const spaceCoinAddress = await spaceCoinICOOwner.spaceCoin();

    spaceCoin = SpaceCoinFactory.connect(spaceCoinAddress, owner);

    await spaceCoinICOOwner.addInvestor(privateInvestor.address);
  });

  const incrementPhaseToOpen = async () => {
    // increment to Phase General
    await spaceCoinICOOwner.incrementPhase();
    // increment to Phase Open
    await spaceCoinICOOwner.incrementPhase();
  };

  describe('ico functions correctly (happy paths)', async () => {
    it('should succeed for any contributor with a large amount', async () => {
      await incrementPhaseToOpen();

      await expect(
        spaceCoinICOGeneralContributor.invest({
          value: contributionAmountLarge
        })
      )
        .to.emit(spaceCoinICOGeneralContributor, 'InvestmentReceived')
        .withArgs(generalContributor.address, contributionAmountLarge);
    });

    it('should allow the owner to toggle tax', async () => {
      expect(await spaceCoin.taxEnabled()).eq(false);

      await spaceCoinICOOwner.toggleTaxEnabled();

      expect(await spaceCoin.taxEnabled()).eq(true);
    });

    it('should allow anyone to claim tokens and issue immediately', async () => {
      await incrementPhaseToOpen();

      await expect(
        spaceCoinICOGeneralContributor.invest({
          value: contributionAmountOneEther
        })
      )
        .to.emit(spaceCoin, 'Transfer')
        .withArgs(spaceCoinICOOwner.address, generalContributor.address, fiveTokensAmount);
    });

    it('should allow a private investor to claim tokens', async () => {
      await expect(
        spaceCoinICOPrivateInvestor.invest({
          value: contributionAmountOneEther.mul(3)
        })
      );

      await incrementPhaseToOpen();

      await expect(spaceCoinICOPrivateInvestor.claimTokens())
        .to.emit(spaceCoin, 'Transfer')
        .withArgs(spaceCoinICOOwner.address, privateInvestor.address, fiveTokensAmount.mul(3));
    });
  });

  describe('ico functions correctly (sad paths)', async () => {
    it('should fail to invest if <5 gwei', async () => {
      await incrementPhaseToOpen();

      await expect(
        spaceCoinICOGeneralContributor.invest({
          value: BigNumber.from(3)
        })
      ).to.be.revertedWith('Must send ether');
    });

    it('should fail to invest if it goes over the goal limit', async () => {
      await incrementPhaseToOpen();

      // get 10 signers from the pool and have them invest the phase limit
      const randomSigners = (await ethers.getSigners()).slice(7, 17);

      for (const randomSigner of randomSigners) {
        await spaceCoinICOOwner.connect(randomSigner).invest({
          value: goalValue.div(10)
        });
      }

      await expect(
        spaceCoinICOGeneralContributor.invest({
          value: contributionAmountOneEther
        })
      ).to.be.revertedWith('Goal has been met');
    });

    it('should fail to claim tokens if never invested', async () => {
      await incrementPhaseToOpen();

      await expect(spaceCoinICOGeneralContributor.claimTokens()).to.be.revertedWith(
        'Caller is not a contributor'
      );
    });

    it('should fail to invest if paused', async () => {
      await incrementPhaseToOpen();

      await spaceCoinICOOwner.togglePaused();

      await expect(
        spaceCoinICOGeneralContributor.invest({
          value: contributionAmountOneEther.mul(3)
        })
      ).to.be.revertedWith('The contract is currently paused');
    });

    it('should fail to increment if the phase is in Open', async () => {
      await incrementPhaseToOpen();

      await expect(spaceCoinICOOwner.incrementPhase()).to.be.revertedWith(
        'Current phase must not be Open'
      );
    });
  });
});
