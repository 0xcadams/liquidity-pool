import { ethers } from 'hardhat';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { SpaceCoinICO } from '../frontend/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

chai.use(chaiAsPromised);
const { expect } = chai;

const phaseSeedTotalLimit = ethers.utils.parseEther('15000');

const phaseSeedIndividualLimit = ethers.utils.parseEther('1500');
const phaseSeedOverIndividualLimit = ethers.utils.parseEther('1501');

describe('SpaceCoinICO: Phase Seed', () => {
  let spaceCoinICOOwner: SpaceCoinICO;
  let spaceCoinICOTreasury: SpaceCoinICO;
  let spaceCoinICOPrivateInvestor: SpaceCoinICO;
  let spaceCoinICOGeneralContributor: SpaceCoinICO;

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

    await spaceCoinICOOwner.addInvestor(privateInvestor.address);
  });

  describe('ico functions correctly (happy paths)', async () => {
    it('should succeed for private investor', async () => {
      await expect(
        spaceCoinICOPrivateInvestor.invest({
          value: phaseSeedIndividualLimit
        })
      )
        .to.emit(spaceCoinICOPrivateInvestor, 'InvestmentReceived')
        .withArgs(privateInvestor.address, phaseSeedIndividualLimit);
    });
  });

  describe('ico functions correctly (sad paths)', async () => {
    it('should fail for over the individual limit', async () => {
      await expect(
        spaceCoinICOGeneralContributor.invest({
          value: phaseSeedOverIndividualLimit
        })
      ).to.be.revertedWith('Indiv contribution above the limit');
    });

    it('should fail for over the total phase limit', async () => {
      // get 10 signers from the pool and have them invest the phase limit
      const randomSigners = (await ethers.getSigners()).slice(7, 17);

      let runningTotal = ethers.BigNumber.from(0);

      for (const randomSigner of randomSigners) {
        await spaceCoinICOOwner.addInvestor(randomSigner.address);

        const contribution = phaseSeedIndividualLimit.sub(1000);

        await spaceCoinICOOwner.connect(randomSigner).invest({
          value: contribution
        });

        runningTotal = runningTotal.add(contribution);
      }

      // now the investor should not be able to invest if it's 1 gwei over the limit
      await expect(
        spaceCoinICOPrivateInvestor.invest({
          value: phaseSeedTotalLimit.sub(runningTotal).add(1)
        })
      ).to.be.revertedWith('Goal has been met');
    });

    it('should fail to invest if paused', async () => {
      await spaceCoinICOOwner.togglePaused();

      await expect(
        spaceCoinICOPrivateInvestor.invest({
          value: phaseSeedIndividualLimit
        })
      ).to.be.revertedWith('The contract is currently paused');
    });

    it('should fail if investor is removed', async () => {
      await spaceCoinICOOwner.removeInvestor(privateInvestor.address);

      await expect(
        spaceCoinICOPrivateInvestor.invest({
          value: phaseSeedIndividualLimit
        })
      ).to.be.revertedWith('Not available to invest');
    });

    it('should fail for general contributor', async () => {
      await expect(
        spaceCoinICOGeneralContributor.invest({
          value: phaseSeedIndividualLimit
        })
      ).to.be.revertedWith('Not available to invest');
    });

    it('should fail to claim tokens', async () => {
      await spaceCoinICOPrivateInvestor.invest({
        value: phaseSeedIndividualLimit
      });

      await expect(spaceCoinICOPrivateInvestor.claimTokens()).to.be.revertedWith(
        'Current phase must be Open'
      );
    });

    it('should fail as investor to toggle paused', async () => {
      await expect(spaceCoinICOPrivateInvestor.togglePaused()).to.be.revertedWith(
        'Caller is not the owner'
      );
    });

    it('should fail as investor to toggle tax', async () => {
      await expect(spaceCoinICOPrivateInvestor.toggleTaxEnabled()).to.be.revertedWith(
        'Caller is not the owner'
      );
    });

    it('should fail as investor to increment phase', async () => {
      await expect(spaceCoinICOPrivateInvestor.incrementPhase()).to.be.revertedWith(
        'Caller is not the owner'
      );
    });

    it('should fail as investor to add investor', async () => {
      await expect(
        spaceCoinICOPrivateInvestor.addInvestor(generalContributor.address)
      ).to.be.revertedWith('Caller is not the owner');
    });

    it('should fail as investor to remove investor', async () => {
      await expect(
        spaceCoinICOPrivateInvestor.removeInvestor(privateInvestor.address)
      ).to.be.revertedWith('Caller is not the owner');
    });
  });
});
