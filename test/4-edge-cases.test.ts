import { ethers } from 'hardhat';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import {
  SpaceCoin__factory as SpaceCoinFactory,
  SpaceCoinETHPair__factory as SpaceCoinETHPairFactory
} from '../frontend/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

chai.use(chaiAsPromised);
const { expect } = chai;

const tenToThe18 = ethers.BigNumber.from(10).pow(18);
// Total supply is: 500k * 10^18
const totalSupply = ethers.BigNumber.from(500000).mul(tenToThe18);

describe('SpaceCoin: Edge Cases', () => {
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let investor: SignerWithAddress;
  let transferRecipient: SignerWithAddress;

  beforeEach(async () => {
    [owner, treasury, investor, transferRecipient] = await ethers.getSigners();
  });

  describe('edge cases function correctly (sad paths)', async () => {
    it('should initialize with treasury address', async () => {
      const SpaceCoinICO = await ethers.getContractFactory('SpaceCoinICO');

      // does not revert, since the zero check was removed
      await expect(SpaceCoinICO.deploy(ethers.constants.AddressZero)).to.not.be.reverted;
    });

    it('should not allow non-owner to toggle tax', async () => {
      const SpaceCoinICO = await ethers.getContractFactory('SpaceCoinICO');
      const spaceCoinICOOwner = await SpaceCoinICO.deploy(treasury.address);
      const spaceCoinAddress = await spaceCoinICOOwner.spaceCoin();
      const spaceCoin = SpaceCoinFactory.connect(spaceCoinAddress, treasury);

      await expect(spaceCoin.toggleTaxEnabled()).to.be.revertedWith('Caller is not the owner');
    });

    it('should not allow external to send ETH to router or pair', async () => {
      const SpaceCoinICO = await ethers.getContractFactory('SpaceCoinICO');
      const spaceCoinICOOwner = await SpaceCoinICO.deploy(treasury.address);
      const spaceCoinAddress = await spaceCoinICOOwner.spaceCoin();
      const spaceCoin = SpaceCoinFactory.connect(spaceCoinAddress, treasury);

      const SpaceRouter = await ethers.getContractFactory('SpaceRouter');
      const spaceRouterOwner = await SpaceRouter.deploy(spaceCoinAddress);

      const spaceCoinEthPairAddress = await spaceRouterOwner.spaceCoinEthPair();
      const spaceCoinEthPairOwner = SpaceCoinETHPairFactory.connect(spaceCoinEthPairAddress, owner);

      await expect(
        spaceRouterOwner.receiveEther({ value: ethers.utils.parseEther('1') })
      ).to.be.revertedWith('Caller is not SPC-ETH');

      await expect(
        spaceCoinEthPairOwner.receiveEther({ value: ethers.utils.parseEther('1') })
      ).to.be.revertedWith('Caller not router');
    });
  });
});
