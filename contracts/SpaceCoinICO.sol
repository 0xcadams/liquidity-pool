// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import './SpaceCoin.sol';
import './SpaceRouter.sol';

contract SpaceCoinICO {
  /**
   * @dev Different phases of the ICO process.
   */
  enum ICOPhase {
    Seed,
    General,
    Open
  }

  SpaceCoin public spaceCoin;

  address private immutable _owner;
  uint256 private immutable _contributionToTokenRatio;

  ICOPhase public currentPhase;
  bool private _isPaused;

  mapping(address => uint256) private _contributions;
  mapping(address => uint256) private _contributionsClaimed;
  uint256 private _totalContribution;
  uint256 private _totalWithdrawn;

  mapping(address => bool) private _seedInvestors;

  event InvestmentReceived(address contributor, uint256 amount);

  constructor(address treasury) {
    spaceCoin = new SpaceCoin(treasury);

    _owner = msg.sender;
    _contributionToTokenRatio = 5;
  }

  /**
   * @dev Throws if called by any account other than the owner.
   */
  modifier onlyOwner() {
    require(_owner == msg.sender, 'Caller is not the owner');
    _;
  }

  /**
   * @dev Throws if called by any account which hasn't contributed.
   */
  modifier onlyContributor() {
    require(_contributions[msg.sender] > 0, 'Caller is not a contributor');
    _;
  }

  /**
   * @dev Throws if the contract has been marked paused by the owner.
   */
  modifier notPaused() {
    require(!_isPaused, 'The contract is currently paused');
    _;
  }

  /**
   * @dev Throws if the fundraising goal has been met or exceeded for the current phase.
   */
  modifier goalNotMetOrExceeded(uint256 amount) {
    uint256 totalContribution = _totalContribution + amount;

    bool isGoalNotMet = currentPhase == ICOPhase.Seed
      ? totalContribution <= 15000 ether
      : totalContribution <= 30000 ether;

    require(isGoalNotMet, 'Goal has been met or exceeded');
    _;
  }

  /**
   * @dev Throws if the user's total contribution is too high for the current phase.
   */
  modifier contributionBelowLimit(uint256 amount) {
    uint256 totalIndividualContribution = _contributions[msg.sender] + amount;

    bool isContributionBelowLimit = currentPhase == ICOPhase.Seed
      ? totalIndividualContribution <= 1500 ether
      : currentPhase == ICOPhase.General
      ? totalIndividualContribution <= 1000 ether
      : true;

    require(isContributionBelowLimit, 'Indiv contribution above the limit');
    _;
  }

  /**
   * @dev Toggles the tax on transfers of tokens.
   */
  function toggleTaxEnabled() external onlyOwner {
    spaceCoin.toggleTaxEnabled();
  }

  /**
   * @dev Toggles the paused state.
   */
  function togglePaused() external onlyOwner {
    _isPaused = !_isPaused;
  }

  /**
   * @dev Increments the current phase of the ICO.
   */
  function incrementPhase() external onlyOwner notPaused {
    require(currentPhase != ICOPhase.Open, 'Current phase must not be Open');
    if (currentPhase == ICOPhase.Seed) {
      currentPhase = ICOPhase.General;
    } else {
      currentPhase = ICOPhase.Open;
    }
  }

  /**
   * @dev Adds an investor to the investor whitelist.
   */
  function addInvestor(address investor) external onlyOwner notPaused {
    _seedInvestors[investor] = true;
  }

  /**
   * @dev Removes an investor from the investor whitelist.
   */
  function removeInvestor(address investor) external onlyOwner notPaused {
    _seedInvestors[investor] = false;
  }

  /**
   * @dev Withdraws a specified amount of ETH/SPC from the contract to an LP.
   */
  function moveToLiquidityPool(uint256 amountEthRequested, address router)
    external
    onlyOwner
    notPaused
  {
    require(
      (_totalContribution - _totalWithdrawn) >= amountEthRequested,
      'Withdrawal amount not available'
    );

    _totalWithdrawn += amountEthRequested;

    uint256 amountSpcRequested = amountEthRequested * _contributionToTokenRatio;

    bool success = spaceCoin.approve(router, amountSpcRequested);
    require(success, 'Could not increase allowance');

    (uint256 liquidity, , ) = SpaceRouter(router).addLiquidity{ value: amountEthRequested }(
      amountSpcRequested,
      msg.sender
    );
    require(liquidity > 0, 'Could not add liquidity');
  }

  /**
   * @dev Allows a user to claim their SPC tokens. Chosen due to possibly high gas costs for performing
   * transfer when the phase is changed to Open.
   */
  function claimTokens() external onlyContributor {
    require(currentPhase == ICOPhase.Open, 'Current phase must be Open');

    issueTokensToUser(msg.sender);
  }

  /**
   * @dev Allows a user to invest in the ICO if they meet the requirements of the current phase.
   * Requires >_contributionToTokenRatio due to rounding issues below it.
   */
  function invest()
    external
    payable
    notPaused
    goalNotMetOrExceeded(msg.value)
    contributionBelowLimit(msg.value)
  {
    bool isAvailableToInvest = currentPhase == ICOPhase.Seed ? _seedInvestors[msg.sender] : true;
    // if the sender is in the seedInvestors list, they can invest
    require(isAvailableToInvest, 'Not available to invest');
    // require a value greater than the ratio, to avoid zero purchases of tokens
    require(msg.value > _contributionToTokenRatio, 'Must send ether');

    _contributions[msg.sender] += msg.value;
    _totalContribution += msg.value;

    emit InvestmentReceived(msg.sender, msg.value);

    if (currentPhase == ICOPhase.Open) {
      issueTokensToUser(msg.sender);
    }
  }

  /**
   * @dev Issue owed tokens to a user.
   */
  function issueTokensToUser(address to) private {
    uint256 contributions = _contributions[to] - _contributionsClaimed[to];

    require(contributions > 0, 'No tokens owed');

    _contributionsClaimed[to] += contributions;

    // since totalContribution is capped at 30000 ether, there is no need to check supply before issuing tokens
    bool success = spaceCoin.transfer(to, contributions * _contributionToTokenRatio);
    require(success, 'Unable to transfer');
  }
}
