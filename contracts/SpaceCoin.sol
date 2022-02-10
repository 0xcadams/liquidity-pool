// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

// import 'hardhat/console.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract SpaceCoin is ERC20 {
  uint256 private constant TAX_RATE_PERCENT = 2;

  bool public taxEnabled;

  address private immutable _owner;
  address private immutable _treasury;

  // slither-disable-next-line missing-zero-check
  constructor(address treasury) ERC20('SpaceCoin', 'SPC') {
    _owner = msg.sender;
    _treasury = treasury;

    // Capped supply is 5*10^5 tokens
    _mint(msg.sender, 5 * 10**(5 + decimals()));
  }

  /**
   * @dev Toggles the tax on transfers of tokens.
   */
  function toggleTaxEnabled() external {
    require(msg.sender == _owner, 'Caller is not the owner');

    taxEnabled = !taxEnabled;
  }

  /**
   * @dev Overrides the `_transfer` function to apply a conditional tax when enabled.
   */
  function _transfer(
    address sender,
    address recipient,
    uint256 amount
  ) internal virtual override {
    if (taxEnabled) {
      uint256 taxAmount = (amount * TAX_RATE_PERCENT) / 100;
      super._transfer(sender, _treasury, taxAmount);
      amount -= taxAmount;
    }
    super._transfer(sender, recipient, amount);
  }
}
