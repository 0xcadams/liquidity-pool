import { ethers } from 'hardhat';

async function main() {
  const SpaceCoinICO = await ethers.getContractFactory('SpaceCoinICO');

  const contractAddress = '0x3d38b9F4d22Dd2280816f1c406AEe74D1537E41f';

  const contract = await SpaceCoinICO.attach(contractAddress);

  await contract.incrementPhase();

  console.log(`--- Incremented phase for: ${contract.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
