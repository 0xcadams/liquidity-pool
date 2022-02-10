import { ethers } from 'hardhat';

async function main() {
  const SpaceCoinICO = await ethers.getContractFactory('SpaceCoinICO');

  const ethAddress = '0xa678c0342cc2AD21B084923b995a63cD5D439B5b';

  const contract = await SpaceCoinICO.deploy(ethAddress);

  await contract.deployed();

  await contract.addInvestor(ethAddress);

  const spaceCoinAddress = await contract.spaceCoin();

  const SpaceRouter = await ethers.getContractFactory('SpaceRouter');
  const spaceRouterOwner = await SpaceRouter.deploy(spaceCoinAddress);

  const spaceCoinEthPairAddress = await spaceRouterOwner.spaceCoinEthPair();

  console.log(`------ Deployed to the addresses:`);
  console.log(`--- ICO: ${contract.address}`);
  console.log(`--- Coin: ${spaceCoinAddress}`);
  console.log(`--- Router: ${spaceRouterOwner.address}`);
  console.log(`--- SPC-ETH: ${spaceCoinEthPairAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
