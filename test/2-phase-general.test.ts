import { ethers } from 'hardhat';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { SpaceCoin, SpaceCoinICO, SpaceCoin__factory as SpaceCoinFactory } from '../frontend/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

chai.use(chaiAsPromised);
const { expect } = chai;

const goalValue = ethers.utils.parseEther('30000');

const contributionAmountOneEther = ethers.utils.parseEther('1');
const phaseGeneralIndividualLimit = ethers.utils.parseEther('1000');
const phaseGeneralOverIndividualLimit = ethers.utils.parseEther('1001');

const fiveTokensAmount = ethers.BigNumber.from(5).mul(ethers.BigNumber.from(10).pow(18));

describe('SpaceCoinICO: Phase General', () => {
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

  const incrementPhaseToGeneral = async () => {
    // increment to Phase General
    await spaceCoinICOOwner.incrementPhase();
  };

  describe('ico functions correctly (happy paths)', async () => {
    it('should succeed for any contributor with a large amount', async () => {
      await incrementPhaseToGeneral();

      await expect(
        spaceCoinICOGeneralContributor.invest({
          value: phaseGeneralIndividualLimit
        })
      )
        .to.emit(spaceCoinICOGeneralContributor, 'InvestmentReceived')
        .withArgs(generalContributor.address, phaseGeneralIndividualLimit);
    });

    it('should allow the owner to toggle tax', async () => {
      expect(await spaceCoin.taxEnabled()).eq(false);

      await spaceCoinICOOwner.toggleTaxEnabled();

      expect(await spaceCoin.taxEnabled()).eq(true);
    });

    it('should allow the owner to increment to Open phase', async () => {
      await incrementPhaseToGeneral();

      await spaceCoinICOOwner.incrementPhase();

      expect(await spaceCoinICOOwner.currentPhase()).to.eq(2);
    });
  });

  describe('ico functions correctly (sad paths)', async () => {
    it('should fail to invest if it goes over the individual limit', async () => {
      await incrementPhaseToGeneral();

      await expect(
        spaceCoinICOGeneralContributor.invest({
          value: phaseGeneralOverIndividualLimit
        })
      ).to.be.revertedWith('Indiv contribution above the limit');
    });

    it('should fail to invest if it goes over the goal limit', async () => {
      await incrementPhaseToGeneral();

      // get 30 signers from the pool and have them invest the phase limit
      const randomSigners = (await ethers.getSigners()).slice(7, 37);

      for (const randomSigner of randomSigners) {
        await spaceCoinICOOwner.connect(randomSigner).invest({
          value: goalValue.div(30)
        });
      }

      await expect(
        spaceCoinICOGeneralContributor.invest({
          value: contributionAmountOneEther
        })
      ).to.be.revertedWith('Goal has been met');
    });

    it('should fail to claim tokens if never invested', async () => {
      await incrementPhaseToGeneral();

      await expect(spaceCoinICOGeneralContributor.claimTokens()).to.be.revertedWith(
        'Caller is not a contributor'
      );
    });

    it('should fail to allow a private investor to claim tokens', async () => {
      await expect(
        spaceCoinICOPrivateInvestor.invest({
          value: contributionAmountOneEther.mul(3)
        })
      );

      await incrementPhaseToGeneral();

      await expect(spaceCoinICOPrivateInvestor.claimTokens()).to.be.revertedWith(
        'Current phase must be Open'
      );
    });

    it('should fail to invest if paused', async () => {
      await incrementPhaseToGeneral();

      await spaceCoinICOOwner.togglePaused();

      await expect(
        spaceCoinICOGeneralContributor.invest({
          value: contributionAmountOneEther.mul(3)
        })
      ).to.be.revertedWith('The contract is currently paused');
    });
  });
});
