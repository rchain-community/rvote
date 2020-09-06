/** @type {(uri: string) => string } */
export function lookup_rho(uri) {
    return `new return, lookup(\`rho:registry:lookup\`)
     in {
    new valueCh in {
      lookup!(\`${uri}\`, *valueCh) |
      for (@value <- valueCh) {
        match value {
          Nil => return!((false, Nil))
          _ => return!((true, value))
        }
      }
    }
  }`
}
