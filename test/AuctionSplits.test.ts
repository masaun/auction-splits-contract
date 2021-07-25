///---------------------------------------------------------------
/// This test is referrenced from main.test.ts (Mirror.xyz)
///---------------------------------------------------------------

//@dev - Zora Auction House
import chai, { expect } from "chai";
import asPromised from "chai-as-promised";
import { ethers } from "hardhat";
import { Market, Media } from "@zoralabs/core/dist/typechain";
import { AuctionHouse, BadBidder, TestERC721, BadERC721 } from "../typechain";
import { formatUnits } from "ethers/lib/utils";
import { BigNumber, Contract, Signer } from "ethers";
import {
  approveAuction,
  deployBidder,
  deployOtherNFTs,
  deployWETH,
  deployZoraProtocol,
  mint,
  ONE_ETH,
  revert,
  TWO_ETH,
  TENTH_ETH,
  THOUSANDTH_ETH
} from "./utils";

//@dev - Mirror.xyz
import { expect } from "chai";
//import { BigNumber } from "ethers";
import { waffle } from "hardhat";
//import { ethers, waffle } from "hardhat";
import AllocationTree from "./mirror/merkle-tree/balance-tree";
//import AllocationTree from "../merkle-tree/balance-tree";

import scenarios from "./mirror/scenarios.json";
//import scenarios from "./scenarios.json";

let proxyFactory;

let market: Market;
let media: Media;
let weth: Contract;
let badERC721: BadERC721;
let testERC721: TestERC721;

let auctionHouse: AuctionHouse;

const ONE_DAY = 24 * 60 * 60;

// helper function so we can parse numbers and do approximate number calculations, to avoid annoying gas calculations
const smallify = (bn: BigNumber) => bn.div(THOUSANDTH_ETH).toNumber();

const deployAuctionHouse = async () => {
  await ethers.provider.send("hardhat_reset", []);
  const contracts = await deployZoraProtocol();
  const nfts = await deployOtherNFTs();
  market = contracts.market;
  media = contracts.media;
  weth = await deployWETH();
  badERC721 = nfts.bad;
  testERC721 = nfts.test;

  const AuctionHouse = await ethers.getContractFactory("AuctionHouse");
  const auctionHouse = await AuctionHouse.deploy(media.address, weth.address);

  return auctionHouse as AuctionHouse;
}

const deploySplitter = async (auctionHouse: string) => {
  const Splitter = await ethers.getContractFactory("AuctionSplits");
  const splitter = await Splitter.deploy(auctionHouse);
  return await splitter.deployed();
};

const deployProxyFactory = async (splitterAddress: string, fakeWETHAddress: string) => {
  const SplitFactory = await ethers.getContractFactory("SplitFactory");
  const proxyFactory = await SplitFactory.deploy(splitterAddress, fakeWETHAddress);
  return await proxyFactory.deployed();
};

const PERCENTAGE_SCALE = 1000000;
const NULL_BYTES =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("SplitProxy via Factory", () => {

  ///-----------------------------------------
  /// In case that allocation is 50%, 50%
  ///-----------------------------------------
  describe("basic test", () => {
    let proxy, callableProxy;
    let funder, fakeWETH, account1, account2, transactionHandler;
    let tree;

    // Global contract instance for basic test
    let auctionHouse
    let splitter
    //let proxyFactory

    describe("when there is a 50-50 allocation", () => {
      beforeEach(async () => {
        [
          funder,
          fakeWETH,
          account1,
          account2,
          transactionHandler,
        ] = await ethers.getSigners();

        const claimers = [account1, account2];  // [Note]: In case that allocation is 50%, 50%

        const allocationPercentages = [50000000, 50000000];
        const allocations = allocationPercentages.map((percentage, index) => {
          return {
            account: claimers[index].address,
            allocation: BigNumber.from(percentage),
          };
        });

        tree = new AllocationTree(allocations);
        const rootHash = tree.getHexRoot();

        // @notice - Deploy Zora AutionHouse contract
        auctionHouse = await deployAuctionHouse();

        // @notice - Deploy split contracts
        splitter = await deploySplitter(auctionHouse.address);  /// [Todo]: Deploy the AuctionHouse.sol in advance
        proxyFactory = await deployProxyFactory(splitter.address, fakeWETH.address);

        // @dev - Execute createSplit() method that is defined in the SplitFactory.sol
        const deployTx = await proxyFactory.connect(funder).createSplit(rootHash);

        // Compute address.
        const constructorArgs = ethers.utils.defaultAbiCoder.encode(
          ["bytes32"],
          [rootHash]
        );
        const salt = ethers.utils.keccak256(constructorArgs);
        const proxyBytecode = (await ethers.getContractFactory("SplitProxy"))
          .bytecode;
        const codeHash = ethers.utils.keccak256(proxyBytecode);
        const proxyAddress = await ethers.utils.getCreate2Address(
          proxyFactory.address,
          salt,
          codeHash
        );
        proxy = await (
          await ethers.getContractAt("SplitProxy", proxyAddress)
        ).deployed();

        callableProxy = await (
          await ethers.getContractAt("Splitter", proxy.address)
        ).deployed();
      });

      ///--------------------------------
      /// Zora's Auction House-related method
      ///--------------------------------
      /// [Todo]: Add logic to below
      // let market: Market;
      // let media: Media;
      // let weth: WETH;
      let auction: AuctionHouse;
      let otherNft: TestERC721;
      let deployer, creator, owner, curator, bidderA, bidderB, otherUser: Signer;
      let deployerAddress,
        ownerAddress,
        creatorAddress,
        curatorAddress,
        bidderAAddress,
        bidderBAddress,
        otherUserAddress: string;

      async function deploy(): Promise<AuctionHouse> {
        const AuctionHouse = await ethers.getContractFactory("AuctionHouse");
        const auctionHouse = await AuctionHouse.deploy(media.address, weth.address);

        return auctionHouse as AuctionHouse;
      }

      beforeEach(async () => {
        await ethers.provider.send("hardhat_reset", []);
        [
          deployer,
          creator,
          owner,
          curator,
          bidderA,
          bidderB,
          otherUser,
        ] = await ethers.getSigners();
        [
          deployerAddress,
          creatorAddress,
          ownerAddress,
          curatorAddress,
          bidderAAddress,
          bidderBAddress,
          otherUserAddress,
        ] = await Promise.all(
          [deployer, creator, owner, curator, bidderA, bidderB].map((s) =>
            s.getAddress()
          )
        );
        const contracts = await deployZoraProtocol();
        const nfts = await deployOtherNFTs();
        market = contracts.market;
        media = contracts.media;
        weth = await deployWETH();
        auction = await deploy();
        otherNft = nfts.test;
        await mint(media.connect(creator));
        await otherNft.mint(creator.address, 0);
        await media.connect(creator).transferFrom(creatorAddress, ownerAddress, 0);
        await otherNft
          .connect(creator)
          .transferFrom(creatorAddress, ownerAddress, 0);
      });

      describe("ETH Auction with no curator", async () => {
        async function run() {
          await media.connect(owner).approve(auction.address, 0);
          await auction
            .connect(owner)
            .createAuction(
              0,
              media.address,
              ONE_DAY,
              TENTH_ETH,
              ethers.constants.AddressZero,
              0,
              ethers.constants.AddressZero
            );
          await auction.connect(bidderA).createBid(0, ONE_ETH, { value: ONE_ETH });
          await auction.connect(bidderB).createBid(0, TWO_ETH, { value: TWO_ETH });
          await ethers.provider.send("evm_setNextBlockTimestamp", [
            Date.now() + ONE_DAY,
          ]);
          await auction.connect(otherUser).endAuction(0);
        }

        it("should transfer the NFT to the winning bidder", async () => {
          await run();
          expect(await media.ownerOf(0)).to.eq(bidderBAddress);
        });

        it("should withdraw the winning bid amount from the winning bidder", async () => {
          const beforeBalance = await ethers.provider.getBalance(bidderBAddress);
          await run();
          const afterBalance = await ethers.provider.getBalance(bidderBAddress);

          expect(smallify(beforeBalance.sub(afterBalance))).to.be.approximately(
            smallify(TWO_ETH),
            smallify(TENTH_ETH)
          );
        });

        it("should refund the losing bidder", async () => {
          const beforeBalance = await ethers.provider.getBalance(bidderAAddress);
          await run();
          const afterBalance = await ethers.provider.getBalance(bidderAAddress);

          expect(smallify(beforeBalance)).to.be.approximately(
            smallify(afterBalance),
            smallify(TENTH_ETH)
          );
        });

        it("should pay the auction creator", async () => {
          const beforeBalance = await ethers.provider.getBalance(ownerAddress);
          await run();
          const afterBalance = await ethers.provider.getBalance(ownerAddress);

          // 15% creator fee -> 2ETH * 85% = 1.7 ETH
          expect(smallify(afterBalance)).to.be.approximately(
            smallify(beforeBalance.add(TENTH_ETH.mul(17))),
            smallify(TENTH_ETH)
          );
        });

        it("should pay the token creator in WETH", async () => {
          const beforeBalance = await weth.balanceOf(creatorAddress);
          await run();
          const afterBalance = await weth.balanceOf(creatorAddress);

          // 15% creator fee -> 2 ETH * 15% = 0.3 WETH
          expect(afterBalance).to.eq(beforeBalance.add(THOUSANDTH_ETH.mul(300)));
        });
      });

      describe("#createAuction", () => {});

      describe("#setAuctionApproval", () => {});

      describe("#setAuctionApproval", () => {});

      describe("#setAuctionReservePrice", () => {});

      describe("#createBid", () => {});

      describe("#cancelAuction", () => {});

      describe("#endAuction", () => {});


      ///--------------------------------
      /// Split-related method
      ///--------------------------------
      describe("and 1 ETH is deposited and the window is incremented", () => {
        beforeEach(async () => {
          await funder.sendTransaction({
            to: proxy.address,
            value: ethers.utils.parseEther("1"),
          });

          await callableProxy.incrementWindow();
        });

        describe("and one account claims on the first window", () => {
          let amountClaimed, allocation, claimTx;
          beforeEach(async () => {
            // Setup.
            const window = 0;
            const account = account1.address;
            allocation = BigNumber.from("50000000");
            const proof = tree.getProof(account, allocation);
            const accountBalanceBefore = await waffle.provider.getBalance(
              account
            );

            claimTx = await callableProxy
              .connect(transactionHandler)
              .claim(window, account, allocation, proof);

            const accountBalanceAfter = await waffle.provider.getBalance(
              account
            );

            amountClaimed = accountBalanceAfter.sub(accountBalanceBefore);
          });

          it("it returns 1 ETH for balanceForWindow[0]", async () => {
            expect(await callableProxy.balanceForWindow(0)).to.eq(
              ethers.utils.parseEther("1").toString()
            );
          });

          it("gets 0.5 ETH from scaleAmountByPercentage", async () => {
            expect(
              await callableProxy.scaleAmountByPercentage(
                allocation,
                ethers.utils.parseEther("1").toString()
              )
            ).to.eq(ethers.utils.parseEther("0.5").toString());
          });

          it("allows them to successfully claim 0.5 ETH", async () => {
            expect(amountClaimed.toString()).to.eq(
              ethers.utils.parseEther("0.5").toString()
            );
          });

          it("costs 60982 gas", async () => {
            const { gasUsed } = await claimTx.wait();
            expect(gasUsed.toString()).to.eq("60982");
          });

          describe("and another 1 ETH is added, and the window is incremented", () => {
            beforeEach(async () => {
              await funder.sendTransaction({
                to: proxy.address,
                value: ethers.utils.parseEther("1"),
              });

              await callableProxy.incrementWindow();
            });

            describe("and the other account claims on the second window", () => {
              let amountClaimedBySecond;
              beforeEach(async () => {
                // Setup.
                const window = 1;
                const account = account2.address;
                const allocation = BigNumber.from("50000000");
                const proof = tree.getProof(account, allocation);
                const accountBalanceBefore = await waffle.provider.getBalance(
                  account
                );

                await callableProxy
                  .connect(transactionHandler)
                  .claim(window, account, allocation, proof);

                const accountBalanceAfter = await waffle.provider.getBalance(
                  account
                );

                amountClaimedBySecond = accountBalanceAfter.sub(
                  accountBalanceBefore
                );
              });

              it("allows them to successfully claim 0.5 ETH", async () => {
                expect(amountClaimedBySecond.toString()).to.eq(
                  ethers.utils.parseEther("0.5").toString()
                );
              });
            });

            describe("and the other account claims on the first window", () => {
              let amountClaimedBySecond;
              beforeEach(async () => {
                // Setup.
                const window = 0;
                const account = account2.address;
                const allocation = BigNumber.from("50000000");
                const proof = tree.getProof(account, allocation);
                const accountBalanceBefore = await waffle.provider.getBalance(
                  account
                );

                await callableProxy
                  .connect(transactionHandler)
                  .claim(window, account, allocation, proof);

                const accountBalanceAfter = await waffle.provider.getBalance(
                  account
                );

                amountClaimedBySecond = accountBalanceAfter.sub(
                  accountBalanceBefore
                );
              });

              it("allows them to successfully claim 0.5 ETH", async () => {
                expect(amountClaimedBySecond.toString()).to.eq(
                  ethers.utils.parseEther("0.5").toString()
                );
              });
            });

            describe("and the first account claims on the second window", () => {
              let amountClaimedBySecond;
              beforeEach(async () => {
                // Setup.
                const window = 1;
                const account = account1.address;
                const allocation = BigNumber.from("50000000");
                const proof = tree.getProof(account, allocation);
                const accountBalanceBefore = await waffle.provider.getBalance(
                  account
                );

                await callableProxy
                  .connect(transactionHandler)
                  .claim(window, account, allocation, proof);

                const accountBalanceAfter = await waffle.provider.getBalance(
                  account
                );

                amountClaimedBySecond = accountBalanceAfter.sub(
                  accountBalanceBefore
                );
              });

              it("allows them to successfully claim 0.5 ETH", async () => {
                expect(amountClaimedBySecond.toString()).to.eq(
                  ethers.utils.parseEther("0.5").toString()
                );
              });
            });
          });
        });
      });
    });
  });


  ///--------------------------------------------------
  /// In case that allocation is 25%, 25%, 25%, 25%
  ///--------------------------------------------------

  describe("scenario tests", () => {
    for (
      let scenarioIndex = 0;
      scenarioIndex < scenarios.length;
      scenarioIndex++
    ) {
      const {
        allocationPercentages,
        firstDepositFirstWindow,
        secondDepositSecondWindow,
      } = scenarios[scenarioIndex];
      const scaledPercentages = allocationPercentages.map(
        (p) => p / PERCENTAGE_SCALE
      );

      let funder;
      let secondFunder;
      let thirdFunder;
      let fakeWETH;
      let account1;
      let account2;
      let account3;
      let account4;

      // Zora
      let auctionHouse;

      // Split
      let proxy;
      let splitter;
      let rootHash;
      let deployTx;
      let callableProxy;
      let allocations;
      let tree;
      let claimers;
      let transactionSigner;

      beforeEach(async () => {
        [
          funder,
          secondFunder,
          thirdFunder,
          // Use a different account for transactions, to simplify gas accounting.
          transactionSigner,
          fakeWETH,
          account1,
          account2,
          account3,
          account4,
        ] = await ethers.getSigners();

        claimers = [account1, account2, account3, account4];  // [Note]: In case that allocation is 25%, 25%, 25%, 25%
      });


      ///--------------------------------
      /// Zora's Auction House-related method
      ///--------------------------------
      /// [Todo]: Add logic to below
      describe("#createAuction", () => {});

      describe("#setAuctionApproval", () => {});

      describe("#setAuctionApproval", () => {});

      describe("#setAuctionReservePrice", () => {});

      describe("#createBid", () => {});

      describe("#cancelAuction", () => {});

      describe("#endAuction", () => {});


      ///--------------------------------
      /// Split-related method
      ///--------------------------------
      describe("#createSplit", () => {
        describe(`when the allocation is ${scaledPercentages.join(
          "%, "
        )}%`, () => {
          beforeEach(async () => {
            allocations = allocationPercentages.map((percentage, index) => {
              return {
                account: claimers[index].address,
                allocation: BigNumber.from(percentage),
              };
            });

            tree = new AllocationTree(allocations);
            rootHash = tree.getHexRoot();

            // @notice - Deploy Zora AutionHouse contract
            auctionHouse = await deployAuctionHouse();

            //@dev - Deploy Split-related contracts
            splitter = await deploySplitter(auctionHouse.address);
            proxyFactory = await deployProxyFactory(splitter.address, fakeWETH.address);

            // @dev - Execute createSplit() method that is defined in the SplitFactory.sol
            deployTx = await proxyFactory.connect(funder).createSplit(rootHash);

            // Compute address.
            const constructorArgs = ethers.utils.defaultAbiCoder.encode(
              ["bytes32"],
              [rootHash]
            );
            const salt = ethers.utils.keccak256(constructorArgs);
            const proxyBytecode = (
              await ethers.getContractFactory("SplitProxy")
            ).bytecode;
            const codeHash = ethers.utils.keccak256(proxyBytecode);
            const proxyAddress = await ethers.utils.getCreate2Address(
              proxyFactory.address,
              salt,
              codeHash
            );
            proxy = await (
              await ethers.getContractAt("SplitProxy", proxyAddress)
            ).deployed();

            callableProxy = await (
              await ethers.getContractAt("Splitter", proxy.address)
            ).deployed();
          });

          it("sets the Splitter address", async () => {
            expect(await proxy.splitter()).to.eq(splitter.address);
          });

          it("sets the root hash", async () => {
            expect(await proxy.merkleRoot()).to.eq(rootHash);
          });

          it("deletes the merkleRoot from the factory", async () => {
            expect(await proxyFactory.merkleRoot()).to.eq(NULL_BYTES);
          });

          // NOTE: Gas cost is around 202330, but may vary slightly.
          it("costs 222384 gas to deploy the proxy", async () => {
            const gasUsed = (await deployTx.wait()).gasUsed;
            expect(gasUsed.toString()).to.eq("222384");
          });

          it("costs 688385 gas to deploy the splitter", async () => {
            const gasUsed = (await splitter.deployTransaction.wait()).gasUsed;
            expect(gasUsed.toString()).to.eq("688385");
          });

          describe("when there is 100 ETH in the account and a window has been incremented", () => {
            beforeEach(async () => {
              await secondFunder.sendTransaction({
                to: proxy.address,
                value: ethers.utils.parseEther("100"),
              });

              await callableProxy.incrementWindow();
            });

            for (
              let accountIndex = 0;
              accountIndex < allocationPercentages.length;
              accountIndex++
            ) {
              describe(`and account ${
                accountIndex + 1
              } tries to claim ${firstDepositFirstWindow[
                accountIndex
              ].toString()} ETH on the first window with the correct allocation`, () => {
                let gasUsed;

                it("successfully claims", async () => {
                  const window = 0;
                  const ref = allocations[accountIndex];
                  const { account, allocation } = ref;
                  const proof = tree.getProof(account, allocation);
                  const accountBalanceBefore = await waffle.provider.getBalance(
                    account
                  );
                  const tx = await callableProxy.claim(
                    window,
                    account,
                    allocation,
                    proof
                  );
                  gasUsed = (await tx.wait()).gasUsed;
                  const accountBalanceAfter = await waffle.provider.getBalance(
                    account
                  );

                  const amountClaimed = accountBalanceAfter.sub(
                    accountBalanceBefore
                  );
                  expect(amountClaimed.toString()).to.eq(
                    ethers.utils.parseEther(
                      firstDepositFirstWindow[accountIndex].toString()
                    )
                  );
                });

                // NOTE: Gas cost is around 60973, but depends slightly.
                // it("costs 60984 gas", async () => {
                //   expect(gasUsed.toString()).to.eq("60984");
                // });
              });

              describe("and another 100 ETH is added, and the window is been incremented", () => {
                beforeEach(async () => {
                  await secondFunder.sendTransaction({
                    to: proxy.address,
                    value: ethers.utils.parseEther("100"),
                  });

                  await callableProxy.incrementWindow();
                });

                describe(`and account ${
                  accountIndex + 1
                } tries to claim ${secondDepositSecondWindow[
                  accountIndex
                ].toString()} ETH on the second window with the correct allocation`, () => {
                  let gasUsed;

                  it("successfully claims", async () => {
                    const window = 1;
                    const ref = allocations[accountIndex];
                    const { account, allocation } = ref;
                    const proof = tree.getProof(account, allocation);
                    const accountBalanceBefore = await waffle.provider.getBalance(
                      account
                    );
                    const tx = await callableProxy.claim(
                      window,
                      account,
                      allocation,
                      proof
                    );
                    gasUsed = (await tx.wait()).gasUsed;
                    const accountBalanceAfter = await waffle.provider.getBalance(
                      account
                    );
                    const amountClaimed = accountBalanceAfter.sub(
                      accountBalanceBefore
                    );
                    expect(amountClaimed.toString()).to.eq(
                      ethers.utils.parseEther(
                        secondDepositSecondWindow[accountIndex].toString()
                      )
                    );
                  });

                  // NOTE: Gas cost is around 60973, but depends slightly on the size of the
                  // allocation. Can check by uncommenting this and running the test.
                  // it("costs 60973 gas", async () => {
                  //   expect(gasUsed.toString()).to.eq("60973");
                  // });
                });
              });

              describe(`and account ${
                accountIndex + 1
              } tries to claim with a higher allocation`, () => {
                it("reverts with 'Invalid proof'", async () => {
                  const index = 0;
                  const window = 0;
                  const ref = allocations[index];
                  const { account, allocation } = ref;
                  const incorrectAllocation = allocation + 1;
                  const proof = tree.getProof(account, allocation);
                  await expect(
                    callableProxy.claim(
                      window,
                      account,
                      incorrectAllocation,
                      proof
                    )
                  ).revertedWith("Invalid proof");
                });
              });
            }

            describe("and an account without an allocation tries to claim with account1's proof", () => {
              it("reverts with 'Invalid proof'", async () => {
                const index = 0;
                const window = 0;
                const ref = allocations[index];
                const { account, allocation } = ref;
                const proof = tree.getProof(account, allocation);
                await expect(
                  callableProxy.claim(
                    window,
                    // Here we change the address!
                    account4.address,
                    allocation,
                    proof
                  )
                ).revertedWith("Invalid proof");
              });
            });

            describe("and account 1 tries to claim twice in one window", () => {
              it("reverts on the second attempt", async () => {
                const index = 0;
                const window = 0;
                const ref = allocations[index];
                const { account, allocation } = ref;
                const proof = tree.getProof(account, allocation);
                await callableProxy
                  .connect(transactionSigner)
                  .claim(window, account, allocation, proof);
                await expect(
                  callableProxy.claim(window, account, allocation, proof)
                ).revertedWith("Account already claimed the given window");
              });
            });
          });

          describe("when there is 200 ETH in the account across 2 windows", () => {
            beforeEach(async () => {
              // First Window
              await funder.sendTransaction({
                to: proxy.address,
                value: ethers.utils.parseEther("100"),
              });
              await callableProxy.incrementWindow();
              // Second Window
              await thirdFunder.sendTransaction({
                to: proxy.address,
                value: ethers.utils.parseEther("100"),
              });
              await callableProxy.connect(transactionSigner).incrementWindow();
            });

            for (
              let accountIndex = 0;
              accountIndex < allocationPercentages.length;
              accountIndex++
            ) {
              describe(`and account ${
                accountIndex + 1
              } tries to claim twice in one window`, () => {
                it("reverts on the second attempt", async () => {
                  const window = 0;
                  const ref = allocations[accountIndex];
                  const { account, allocation } = ref;
                  const proof = tree.getProof(account, allocation);
                  await callableProxy
                    .connect(transactionSigner)
                    .claim(window, account, allocation, proof);
                  await expect(
                    callableProxy
                      .connect(transactionSigner)
                      .claim(window, account, allocation, proof)
                  ).revertedWith("Account already claimed the given window");
                });
              });

              describe(`and account ${
                accountIndex + 1
              } tries to claim using claimForAllWindows`, () => {
                let tx;
                it("successfully claims", async () => {
                  const ref = allocations[accountIndex];
                  const { account, allocation } = ref;
                  const proof = tree.getProof(account, allocation);
                  const accountBalanceBefore = await waffle.provider.getBalance(
                    account
                  );
                  tx = await callableProxy
                    .connect(transactionSigner)
                    .claimForAllWindows(account, allocation, proof);
                  const accountBalanceAfter = await waffle.provider.getBalance(
                    account
                  );

                  const amountClaimed = accountBalanceAfter
                    .sub(accountBalanceBefore)
                    .toString();
                  const claimExpected = ethers.utils
                    // Use the appropriate account.
                    .parseEther(scaledPercentages[accountIndex].toString())
                    // Multiply 2 because there are two windows.
                    .mul(2)
                    .toString();
                  expect(amountClaimed).to.eq(claimExpected);
                });

                // NOTE: Gas cost is around 88004, but depends slightly on the size of the
                // allocation. Can check by uncommenting this and running the test.
                // it("costs 88004 gas", async () => {
                //   const receipt = await tx.wait();
                //   expect(receipt.gasUsed.toString()).to.eq("88004");
                // });
              });

              describe(`and account ${
                accountIndex + 1
              } tries to claim twice across both windows`, () => {
                it("successfully claims on each window", async () => {
                  for (let window = 0; window < 2; window++) {
                    const ref = allocations[accountIndex];
                    const { account, allocation } = ref;
                    const proof = tree.getProof(account, allocation);
                    const accountBalanceBefore = await waffle.provider.getBalance(
                      account
                    );
                    const tx = await callableProxy
                      .connect(transactionSigner)
                      .claim(window, account, allocation, proof);
                    const accountBalanceAfter = await waffle.provider.getBalance(
                      account
                    );

                    const amountClaimed = accountBalanceAfter
                      .sub(accountBalanceBefore)
                      .toString();
                    const claimExpected = ethers.utils
                      .parseEther(scaledPercentages[accountIndex].toString())
                      .toString();
                    expect(amountClaimed).to.eq(claimExpected);
                  }
                });
              });
            }
          });
        });
      });
    }
  });
});
