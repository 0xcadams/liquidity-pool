// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import './SpaceCoin.sol';
import './SpaceCoinETHPair.sol';

contract SpaceRouter {
  SpaceCoin public immutable spaceCoin;
  SpaceCoinETHPair public immutable spaceCoinEthPair;

  uint256 public currentEthBalance;

  uint256 private constant _NOT_ENTERED = 1;
  uint256 private constant _ENTERED = 2;

  uint256 private _status;

  constructor(address spaceCoinAddress) {
    spaceCoin = SpaceCoin(spaceCoinAddress);
    spaceCoinEthPair = new SpaceCoinETHPair(spaceCoinAddress);

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
   * @dev Throws if called by any account other than the SPC-ETH pair.
   */
  modifier onlySpcEthPair() {
    require(address(spaceCoinEthPair) == msg.sender, 'Caller is not SPC-ETH');
    _;
  }

  /**
   * @notice Adds liquidity to the pool.
   */
  // slither-disable-next-line reentrancy-eth
  function addLiquidity(uint256 amountSpc, address to)
    external
    payable
    nonReentrant
    returns (
      uint256 calculatedAmountSpc,
      uint256 calculatedAmountEth,
      uint256 liquidity
    )
  {
    // get the amount of ETH the provider wants to add
    uint256 amountEth = msg.value;

    // slither-disable-next-line events-maths
    currentEthBalance += amountEth;

    // get the reserve values from the SPC-ETH pair
    (uint256 reserveSpc, uint256 reserveEth) = spaceCoinEthPair.getReserves();

    // if the reserves are zero, this is the first transaction for the LP
    if (reserveSpc == 0 && reserveEth == 0) {
      (calculatedAmountSpc, calculatedAmountEth) = (amountSpc, amountEth);
    } else {
      // we are adding to an existing pool which has a "k" established
      // get the optimal ETH value to maintain the optimal
      uint256 amountEthOptimal = _getOptimalPairAmount(amountSpc, reserveSpc, reserveEth);
      // if the user-input amount larger than or = the optimal amount
      if (amountEthOptimal <= amountEth) {
        // transfer the **exact** SPC requested and the corresponding ETH to maintain optimal
        (calculatedAmountSpc, calculatedAmountEth) = (amountSpc, amountEthOptimal);
      } else {
        // get the optimal SPC value
        uint256 amountSpcOptimal = _getOptimalPairAmount(amountEth, reserveEth, reserveSpc);
        // assert the requested amount to be at least larger than the optimal (should never be true)
        assert(amountSpcOptimal <= amountSpc);
        // transfer the **exact** ETH requested and the corresponding SPC to maintain optimal
        (calculatedAmountSpc, calculatedAmountEth) = (amountSpcOptimal, amountEth);
      }
    }

    // transfer the calculated SPC from the sender to the SPC-ETH pair
    _safeTransferFromSPC(msg.sender, address(spaceCoinEthPair), calculatedAmountSpc);
    // transfer the calculated ETH from the current contract to the SPC-ETH pair
    _safeTransferETHToPair(calculatedAmountEth);

    // mint the SPC-ETH tokens!!
    liquidity = spaceCoinEthPair.mint(to);

    // refund remaining ETH, if any
    if (msg.value > calculatedAmountEth) {
      _safeTransferETH(msg.sender, msg.value - calculatedAmountEth);
    }
  }

  /**
   * @notice Removes liquidity from the pool.
   *
   * Note - removed amountSpcMin + amountEthMin parameters since there was a Discord discussion
   * about this being an "extra feature".
   */
  // slither-disable-next-line reentrancy-eth
  function removeLiquidity(uint256 liquidity, address to)
    external
    nonReentrant
    returns (uint256 amountSpc, uint256 amountEth)
  {
    // transfer the required liquidity to burn to the SPC-ETH pair
    _safeTransferSpcEthPair(msg.sender, address(spaceCoinEthPair), liquidity);

    // burn the sent liquidity **to the router**
    // since the SPC token has a fee on transfer, cannot send directly to "to"
    // burn sends to this contract address
    (amountSpc, amountEth) = spaceCoinEthPair.burn();

    // transfer all of the SPC from this contract to the "to" address
    _safeTransferSPC(to, spaceCoin.balanceOf(address(this)));
    // transfer all of the ETH from this contract to the "to" address
    _safeTransferETH(to, amountEth);
  }

  /**
   * @notice Swaps ETH for SPC using the pool.
   */
  // slither-disable-next-line reentrancy-eth
  function swapETHForSPC(uint256 amountOutMin, address to) external payable nonReentrant {
    // get the sent value in ETH
    uint256 sentEth = msg.value;

    // slither-disable-next-line events-maths
    currentEthBalance += sentEth;

    // transfer the sent ETH from the current contract to the SPC-ETH pair
    _safeTransferETHToPair(sentEth);

    // get the SPC balance of the recipient before swapping
    uint256 balanceBefore = spaceCoin.balanceOf(to);

    // get the reserve values from the SPC-ETH pair
    (uint256 reserveSpc, uint256 reserveEth) = spaceCoinEthPair.getReserves();

    uint256 amountInput = spaceCoinEthPair.currentEthBalance() - reserveEth;
    uint256 amountOutput = _getAmountOut(amountInput, reserveEth, reserveSpc);

    spaceCoinEthPair.swap(amountOutput, 0, to);

    // ensure the ending SPC balance of the recipient was above the minimum slippage
    require(spaceCoin.balanceOf(to) - balanceBefore >= amountOutMin, 'Insufficient output amount');
  }

  /**
   * @notice Swaps SPC for ETH using the pool.
   */
  // slither-disable-next-line reentrancy-eth
  function swapSPCForETH(
    uint256 amountIn,
    uint256 amountOutMin,
    address to
  ) external nonReentrant {
    // transfer the specified SPC from the sender to the SPC-ETH pair
    _safeTransferFromSPC(msg.sender, address(spaceCoinEthPair), amountIn);

    // get the ETH balance of the recipient before swapping
    uint256 balanceBefore = to.balance;

    // get the reserve values from the SPC-ETH pair
    (uint256 reserveSpc, uint256 reserveEth) = spaceCoinEthPair.getReserves();

    uint256 amountInput = spaceCoin.balanceOf(address(spaceCoinEthPair)) - reserveSpc;
    uint256 amountOutput = _getAmountOut(amountInput, reserveSpc, reserveEth);

    spaceCoinEthPair.swap(0, amountOutput, to);

    // ensure the ending ETH balance of the recipient was above the minimum slippage
    require(to.balance - balanceBefore >= amountOutMin, 'Insufficient output amount');
  }

  function receiveEther() external payable onlySpcEthPair returns (bool) {
    // slither-disable-next-line events-maths
    currentEthBalance += msg.value;

    return true;
  }

  /**
   * @dev Gets the optimal LP pair amount for a given amount and existing reserve values.
   *
   * In other terms, the ratios `reserve1 / reserve2 = amount1 / amount2` must be maintained.
   *
   * From https://github.com/Uniswap/v2-periphery/blob/master/contracts/libraries/UniswapV2Library.sol#L36
   */
  function _getOptimalPairAmount(
    uint256 amount1,
    uint256 reserve1,
    uint256 reserve2
  ) private pure returns (uint256 amount2) {
    require(amount1 > 0, 'Insufficient amount');
    require(reserve1 > 0 && reserve2 > 0, 'Insufficient liquidity');
    amount2 = (amount1 * reserve2) / reserve1;
  }

  /**
   * @dev Given an input amount of an asset and pair reserves, returns the output amount
   * of the other asset, applying a 1% fee.
   *
   * From https://github.com/Uniswap/v2-periphery/blob/master/contracts/libraries/UniswapV2Library.sol#L43
   */
  function _getAmountOut(
    uint256 amountIn,
    uint256 reserveIn,
    uint256 reserveOut
  ) private pure returns (uint256 amountOut) {
    require(amountIn > 0, 'Insufficient amount in');
    require(reserveIn > 0 && reserveOut > 0, 'Insufficient liquidity');
    uint256 amountInWithFee = amountIn * 99; // 1% of trade
    amountOut = (amountInWithFee * reserveOut) / (reserveIn * 100 + amountInWithFee);
  }

  function _safeTransferSpcEthPair(
    address from,
    address to,
    uint256 value
  ) private {
    bool success = spaceCoinEthPair.transferFrom(from, to, value);

    require(success, 'SPC-ETH transfer failed');
  }

  function _safeTransferSPC(address to, uint256 value) private {
    bool success = spaceCoin.transfer(to, value);

    require(success, 'SPC transfer failed');
  }

  function _safeTransferFromSPC(
    address from,
    address to,
    uint256 value
  ) private {
    bool success = spaceCoin.transferFrom(from, to, value);

    require(success, 'SPC transferFrom failed');
  }

  function _safeTransferETH(address to, uint256 value) private {
    require(value <= currentEthBalance, 'ETH value OOB');
    currentEthBalance -= value;

    // slither-disable-next-line low-level-calls
    (bool success, ) = to.call{ value: value }('');
    require(success, 'ETH transfer failed');
  }

  function _safeTransferETHToPair(uint256 value) private {
    require(value <= currentEthBalance, 'ETH value OOB');
    currentEthBalance -= value;

    bool success = spaceCoinEthPair.receiveEther{ value: value }();

    require(success, 'ETH-Pair transfer failed');
  }
}
