// Rholang code to transfer REVs
// https://github.com/rchain/rchain/blob/3eca061/rholang/examples/vault_demo/3.transfer_funds.rho
/**
 * @param {String} revAddrFrom
 * @param {String[]} revAddrTo
 * @param {number} amount
 * @returns { string }
 */
export const transferMulti_rho = (revAddrFrom, revAddrTo, amount) =>
 `match(${lit(revAddrFrom)}, ${lit(amount)}, ${lit(revAddrTo)}) {
    (revAddrFrom, amount, toAddrs) => {
  new rl(\`rho:registry:lookup\`), RevVaultCh, ListOpsCh in {
    rl!(\`rho:rchain:revVault\`, *RevVaultCh) |
    rl!(\`rho:lang:listOps\`, *ListOpsCh) |
    for (@(_, RevVault) <- RevVaultCh;
        @(_, ListOps) <- ListOpsCh) {
      new vaultCh, revVaultkeyCh, txfr1,
        deployerId(\`rho:rchain:deployerId\`),
        deployId(\`rho:rchain:deployId\`)
      in {
            @RevVault!("findOrCreate", revAddrFrom, *vaultCh) |
            @RevVault!("deployerAuthKey", *deployerId, *revVaultkeyCh) |
            for (@vault <- vaultCh; key <- revVaultkeyCh) {
              match vault {
                (true, vault) => {
                  @ListOps!("parMap", toAddrs, *txfr1, *deployId) |
                  contract txfr1(@revAddrTo, return) = {
                    new vaultTo in {
                      @RevVault!("findOrCreate", revAddrTo, *vaultTo) |
                      for (_ <- vaultTo) {
                        @vault!("transfer", revAddrTo, amount, *key, *return)
                      }
                    }
                  }
                }
                err => {
                  deployId!((false, "REV vault cannot be found or created."))
                }
              }
            }
      }
    }
  }
}
}
`;

function lit(v) {
  return JSON.stringify(v, null, 2);
}
