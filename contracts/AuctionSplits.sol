// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

//@notice - Mirror
import { Splitter } from "./mirror/Splitter.sol";
import { SplitProxy } from "./mirror/SplitProxy.sol";
import { SplitFactory } from "./mirror/SplitFactory.sol";
import { SplitStorage } from "./mirror/SplitStorage.sol";

//@notice - Zora's Auction House
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC721, IERC165 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { Counters } from "@openzeppelin/contracts/utils/Counters.sol";
import { IMarket, Decimal } from "@zoralabs/core/dist/contracts/interfaces/IMarket.sol";
import { IMedia } from "@zoralabs/core/dist/contracts/interfaces/IMedia.sol";
import { IAuctionHouse } from "./interfaces/IAuctionHouse.sol";

interface IWETH {
    function deposit() external payable;
    function withdraw(uint wad) external;

    function transfer(address to, uint256 value) external returns (bool);
}

interface IMediaExtended is IMedia {
    function marketContract() external returns(address);
}

/**
 * @title An open auction house, enabling collectors and curators to run their own auctions
 */
contract AuctionSplits {

    IAuctionHouse public auctionHouse;

    // The address of the WETH contract, so that any ETH transferred can be handled as an ERC-20
    address public wethAddress;

    //@dev - Split
    mapping(address => address[]) splitRecipients;  // NFT (tokenContract) address -> recipient address list 

    /*
     * Constructor
     */
    constructor(address _weth, IAuctionHouse _auctionHouse) public {
        wethAddress = _weth;
        auctionHouse = _auctionHouse;
    }


    //----------------
    // Splits Revenue
    //----------------

    //@dev - Add a new recepient to the split recipient list. (onlyOwner)
    function registerSplitRecipients(address tokenContract, address recipient) public returns (bool) {
        //address tokenOwner = IERC721(tokenContract).ownerOf(tokenId);
        splitRecipients[tokenContract].push(recipient);
    }

    function approveSplitsContract(Splitter splitter) public returns (bool) {
        // [Todo]:
    }

    // @notice - Once the split contract has sold an NFT on AuctionHouse, 
    //           - the split particpants have the ability to receive their share.
    //           - This could be implement by individual claiming functions
    function sellNFTFor(Splitter _splitter) public returns (bool) {
        // [Todo]:

    }


    // TODO: consider reverting if the message sender is not WETH
    receive() external payable {}
    fallback() external payable {}
}