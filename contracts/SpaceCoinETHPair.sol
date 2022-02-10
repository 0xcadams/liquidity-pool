// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

import './SpaceCoin.sol';
import './SpaceRouter.sol';

contract SpaceCoinETHPair is ERC20 {
  uint256 public constant MINIMUM_LIQUIDITY = 10**3;

  /// @dev Use dead address here to avoid sending to 0x0 address
  // slither-disable-next-line too-many-digits
  address private constant DEAD_ADDRESS = 0xdEAD000000000000000042069420694206942069;

  SpaceCoin public immutable spaceCoin;

  SpaceRouter private immutable _spaceRouter;

  uint256 private _reserveSpc;
  uint256 private _reserveEth;

  uint256 public currentEthBalance;

  event Mint(address indexed sender, uint256 amountSpc, uint256 amountEth);
  event Burn(address indexed sender, uint256 amountSpc, uint256 amountEth, address indexed to);
  event Swap(
    address indexed sender,
    uint256 amountSpcIn,
    uint256 amountEthIn,
    uint256 amountSpcOut,
    uint256 amountEthOut,
    address indexed to
  );
  event Sync(uint112 reserveSpc, uint112 reserveEth);

  uint256 private constant _NOT_ENTERED = 1;
  uint256 private constant _ENTERED = 2;

  uint256 private _status;

  constructor(address spaceCoinAddress) ERC20('Ethereum-SpaceCoin', 'ETHSPC') {
    spaceCoin = SpaceCoin(spaceCoinAddress);

    _spaceRouter = SpaceRouter(msg.sender);
    _status = _NOT_ENTERED;
  }

  /**
   * @dev https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/security/ReentrancyGuard.sol
   */
  modifier nonReentrant() {
    require(_status != _ENTERED, 'Reentrant');
    _status = _ENTERED;
    _;
    _status = _NOT_ENTERED;
  }

  /**
   * @dev Throws if called by any account other than the SpaceRouter.
   */
  modifier onlySpaceRouter() {
    require(address(_spaceRouter) == msg.sender, 'Caller not router');
    _;
  }

  /**
   * Gets the current reserve values for SPC & ETH.
   */
  function getReserves() public view returns (uint256, uint256) {
    return (_reserveSpc, _reserveEth);
  }

  // slither-disable-next-line reentrancy
  function mint(address to) external nonReentrant onlySpaceRouter returns (uint256 liquidity) {
    (uint256 reserveSpc, uint256 reserveEth) = getReserves(); // gas savings

    uint256 balanceSpc = spaceCoin.balanceOf(address(this));
    uint256 balanceEth = currentEthBalance;

    uint256 amountSpc = balanceSpc - reserveSpc;
    uint256 amountEth = balanceEth - reserveEth;

    uint256 totalSupplySPCETH = totalSupply(); // gas savings

    emit Mint(msg.sender, amountSpc, amountEth);

    // if no SPC-ETH tokens have ever been minted
    // slither-disable-next-line incorrect-inequality
    if (totalSupplySPCETH == 0) {
      liquidity = sqrt(amountSpc * amountEth) - MINIMUM_LIQUIDITY;
      _mint(DEAD_ADDRESS, MINIMUM_LIQUIDITY); // mint the MINIMUM_LIQUIDITY to this address to burn
    } else {
      uint256 x = (amountSpc * totalSupplySPCETH) / reserveSpc;
      uint256 y = (amountEth * totalSupplySPCETH) / reserveEth;

      liquidity = x < y ? x : y;
    }

    require(liquidity > 0, 'Insufficient liquidity minted');

    _mint(to, liquidity);

    _reserveSpc = balanceSpc;
    _reserveEth = balanceEth;
  }

  // slither-disable-next-line reentrancy-benign
  function burn()
    external
    nonReentrant
    onlySpaceRouter
    returns (uint256 amountSpc, uint256 amountEth)
  {
    address to = address(_spaceRouter);
    SpaceCoin spc = spaceCoin; // gas savings
    uint256 balanceSpc = spc.balanceOf(address(this));
    uint256 balanceEth = currentEthBalance;
    uint256 liquidity = balanceOf(address(this));

    uint256 _totalSupply = totalSupply(); // gas savings
    amountSpc = (liquidity * balanceSpc) / _totalSupply; // using balances ensures pro-rata distribution
    amountEth = (liquidity * balanceEth) / _totalSupply; // using balances ensures pro-rata distribution
    require(amountSpc > 0 && amountEth > 0, 'Insufficient liquidity burned');

    _burn(address(this), liquidity);
    _safeTransferSpaceCoin(to, amountSpc);
    _transferEthToRouter(amountEth);

    balanceSpc = spc.balanceOf(address(this));
    balanceEth = currentEthBalance;

    _reserveSpc = balanceSpc;
    _reserveEth = balanceEth;

    // slither-disable-next-line reentrancy-events
    emit Burn(msg.sender, amountSpc, amountEth, to);
  }

  // slither-disable-next-line reentrancy-eth
  function swap(
    uint256 amountSpcOut,
    uint256 amountEthOut,
    address to
  ) external nonReentrant onlySpaceRouter {
    require(amountSpcOut > 0 || amountEthOut > 0, 'Insufficient output amount');
    (uint256 reserveSpc, uint256 reserveEth) = getReserves(); // gas savings
    require(amountSpcOut < reserveSpc && amountEthOut < reserveEth, 'Insufficient liquidity');

    uint256 balanceSpc;
    uint256 balanceEth;
    {
      // scope for _token{0,1}, avoids stack too deep errors
      SpaceCoin spc = spaceCoin; // gas savings
      require(to != address(spc), 'Cannot send to SPC');
      if (amountSpcOut > 0) {
        _safeTransferSpaceCoin(to, amountSpcOut); // optimistically transfer SPC
      }
      if (amountEthOut > 0) {
        _transferEth(to, amountEthOut); // optimistically transfer ETH
      }

      balanceSpc = spc.balanceOf(address(this));
      balanceEth = currentEthBalance;
    }

    uint256 amountSpcIn = balanceSpc > reserveSpc - amountSpcOut
      ? balanceSpc - (reserveSpc - amountSpcOut)
      : 0;
    uint256 amountEthIn = balanceEth > reserveEth - amountEthOut
      ? balanceEth - (reserveEth - amountEthOut)
      : 0;
    require(amountSpcIn > 0 || amountEthIn > 0, 'Insufficient input amount');

    {
      // scope for reserve{0,1}Adjusted, avoids stack too deep errors
      uint256 balanceSpcAdjusted = balanceSpc * 100 - (amountSpcIn * 1);
      uint256 balanceEthAdjusted = balanceEth * 100 - (amountEthIn * 1);
      require(
        balanceSpcAdjusted * balanceEthAdjusted >= reserveSpc * reserveEth * 100**2,
        'K slippage'
      );
    }

    _reserveSpc = balanceSpc;
    _reserveEth = balanceEth;

    // slither-disable-next-line reentrancy-events
    emit Swap(msg.sender, amountSpcIn, amountEthIn, amountSpcOut, amountEthOut, to);
  }

  function receiveEther() external payable onlySpaceRouter returns (bool) {
    // slither-disable-next-line events-maths
    currentEthBalance += msg.value;

    return true;
  }

  function _safeTransferSpaceCoin(address to, uint256 value) private {
    bool success = spaceCoin.transfer(to, value);
    require(success, 'Transfer SPC failed');
  }

  function _transferEth(address to, uint256 value) private {
    currentEthBalance -= value;

    // slither-disable-next-line all
    (bool success, ) = to.call{ value: value }('');
    require(success, 'Transfer ETH failed');
  }

  function _transferEthToRouter(uint256 value) private {
    currentEthBalance -= value;

    bool success = _spaceRouter.receiveEther{ value: value }();
    require(success, 'Transfer ETH failed');
  }

  // babylonian method (https://en.wikipedia.org/wiki/Methods_of_computing_square_roots#Babylonian_method)
  function sqrt(uint256 y) private pure returns (uint256 z) {
    if (y > 3) {
      z = y;
      uint256 x = y / 2 + 1;
      while (x < z) {
        z = x;
        x = (y / x + x) / 2;
      }
    } else if (y != 0) {
      z = 1;
    }
  }
}
