/** @type {(uri: string) => string } */
export function lookup_rho(uri) {
    return `new return(\`rho:rchain:deployId\`), lookup(\`rho:registry:lookup\`)
     in {
    new valueCh in {
      lookup!(\`${uri}\`, *valueCh) |
      for (@value <- valueCh) {
        return!(("Value from registry", value))
      }
    }
  }`
}
