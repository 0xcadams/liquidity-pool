import { ethers } from 'hardhat';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { SpaceCoin, SpaceCoinICO, SpaceCoin__factory as SpaceCoinFactory } from '../frontend/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber } from 'ethers';

chai.use(chaiAsPromised);
const { expect } = chai;

const tenToThe18 = ethers.BigNumber.from(10).pow(18);
// Total supply is: 500k * 10^18
const totalSupply = ethers.BigNumber.from(500000).mul(tenToThe18);

describe('SpaceCoin: Tax', () => {
  let spaceCoinICOOwner: SpaceCoinICO;

  let spaceCoinOwner: SpaceCoin;
  let spaceCoinInvestor: SpaceCoin;
  let spaceCoinTransferRecipient: SpaceCoin;

  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let investor: SignerWithAddress;
  let transferRecipient: SignerWithAddress;

  beforeEach(async () => {
    [owner, treasury, investor, transferRecipient] = await ethers.getSigners();

    const SpaceCoinICO = await ethers.getContractFactory('SpaceCoinICO');
    spaceCoinICOOwner = await SpaceCoinICO.deploy(treasury.address);

    const spaceCoinICOInvestor = spaceCoinICOOwner.connect(investor);

    const spaceCoinAddress = await spaceCoinICOOwner.spaceCoin();

    spaceCoinOwner = SpaceCoinFactory.connect(spaceCoinAddress, owner);
    spaceCoinInvestor = SpaceCoinFactory.connect(spaceCoinAddress, investor);
    spaceCoinTransferRecipient = SpaceCoinFactory.connect(spaceCoinAddress, transferRecipient);

    // increment to Phase General
    await spaceCoinICOOwner.incrementPhase();
    // increment to Phase Open
    await spaceCoinICOOwner.incrementPhase();

    // invest three ether
    await spaceCoinICOInvestor.invest({
      value: ethers.utils.parseEther('3')
    });

    // initial investor balance is 15 tokens
    const initialInvestorBalance = await spaceCoinInvestor.balanceOf(investor.address);
    expect(initialInvestorBalance.div(tenToThe18)).to.be.eq(15);

    // enable tax
    await spaceCoinICOOwner.toggleTaxEnabled();
  });

  describe('coin functions correctly (happy paths)', async () => {
    it('should initialize with the correct supply of tokens', async () => {
      const supply = await spaceCoinOwner.totalSupply();
      expect(supply).to.be.eq(totalSupply);
    });

    it('should deduct a tax on transfer between accounts', async () => {
      const initialTreasuryBalance = await spaceCoinOwner.balanceOf(treasury.address);
      expect(initialTreasuryBalance).to.be.eq(BigNumber.from(0));

      // transfer 2 tokens
      const tokenTransferAmount = BigNumber.from(2).mul(tenToThe18);
      await spaceCoinInvestor.transfer(transferRecipient.address, tokenTransferAmount);

      // 2 percent of the transfer amount
      const finalTreasuryBalance = await spaceCoinOwner.balanceOf(treasury.address);
      expect(finalTreasuryBalance).to.be.eq(tokenTransferAmount.mul(2).div(100));

      // 98 percent of the transfer amount
      const finalRecipientBalance = await spaceCoinOwner.balanceOf(transferRecipient.address);
      expect(finalRecipientBalance).to.be.eq(tokenTransferAmount.mul(98).div(100));
    });

    it('should not deduct a tax on transfer between accounts when disabled', async () => {
      await spaceCoinICOOwner.toggleTaxEnabled();

      const initialTreasuryBalance = await spaceCoinOwner.balanceOf(treasury.address);
      expect(initialTreasuryBalance).to.be.eq(BigNumber.from(0));

      // transfer 2 tokens
      const tokenTransferAmount = BigNumber.from(2).mul(tenToThe18);
      await spaceCoinInvestor.transfer(transferRecipient.address, tokenTransferAmount);

      // 0 tax
      const finalTreasuryBalance = await spaceCoinOwner.balanceOf(treasury.address);
      expect(finalTreasuryBalance).to.be.eq(BigNumber.from(0));

      // 100 percent of the transfer amount
      const finalRecipientBalance = await spaceCoinOwner.balanceOf(transferRecipient.address);
      expect(finalRecipientBalance).to.be.eq(tokenTransferAmount);
    });

    it('should be able to transfer multiple times', async () => {
      const initialTreasuryBalance = await spaceCoinOwner.balanceOf(treasury.address);
      expect(initialTreasuryBalance).to.be.eq(BigNumber.from(0));

      // transfer 2 tokens
      const tokenTransferAmount = BigNumber.from(2).mul(tenToThe18);
      await spaceCoinInvestor.transfer(transferRecipient.address, tokenTransferAmount);

      // transfer 1 tokens back to investor
      const tokenTransferAmountSecond = BigNumber.from(1).mul(tenToThe18);
      await spaceCoinTransferRecipient.transfer(investor.address, tokenTransferAmountSecond);

      // 2 percent of both transfer amounts
      const finalTreasuryBalance = await spaceCoinOwner.balanceOf(treasury.address);
      expect(finalTreasuryBalance).to.be.eq(
        tokenTransferAmount.mul(2).div(100).add(tokenTransferAmountSecond.mul(2).div(100))
      );

      // remainder of the transfer amount
      const finalRecipientBalance = await spaceCoinOwner.balanceOf(transferRecipient.address);
      expect(finalRecipientBalance).to.be.eq(
        tokenTransferAmount.mul(98).div(100).sub(tokenTransferAmountSecond)
      );
    });
  });
});
