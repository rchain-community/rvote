import { keccak256 } from 'js-sha3'
import blake from 'blakejs'
import base58 from 'base-58'
import { ec } from 'elliptic'

const secp256k1 = new ec('secp256k1')

// Algorithm to generate ETH and REV address is taken from RNode source
// https://github.com/rchain/rchain/blob/bf7a30e1/rholang/src/main/scala/coop/rchain/rholang/interpreter/util/AddressTools.scala#L47

// Prefix as defined in https://github.com/rchain/rchain/blob/c6721a6/rholang/src/main/scala/coop/rchain/rholang/interpreter/util/RevAddress.scala#L13
const prefix = { coinId : "000000", version: "00" }

const encodeBase16 = bytes =>
  Array.from(bytes).map(x => (x & 0xff).toString(16).padStart(2, 0)).join('')

const decodeBase16 = hexStr => {
  const removed0x = hexStr.replace(/^0x/, '')
  const byte2hex = ([arr, bhi], x) =>
    bhi ? [[...arr, parseInt(`${bhi}${x}`, 16)]] : [arr, x]
  const [resArr] = Array.from(removed0x).reduce(byte2hex, [[]])
  return Uint8Array.from(resArr)
}

const encodeBase58 = hexStr => {
  const bytes = decodeBase16(hexStr)
  return base58.encode(bytes)
}

const safeDecodeBase58 = str => { try { return base58.decode(str) } catch {} }

export const getAddrFromEth = ethAddrRaw => {
  const ethAddr = ethAddrRaw.replace(/^0x/, '')
  if (!ethAddr || ethAddr.length !== 40) return

  // Hash ETH address
  const ethAddrBytes = decodeBase16(ethAddr)
  const ethHash      = keccak256(ethAddrBytes)

  // Add prefix with hash and calculate checksum (blake2b-256 hash)
  const payload      = `${prefix.coinId}${prefix.version}${ethHash}`
  const payloadBytes = decodeBase16(payload)
  const checksum     = blake.blake2bHex(payloadBytes, void 666, 32).slice(0, 8)

  // Return REV address
  return encodeBase58(`${payload}${checksum}`)
}

export const getAddrFromPublicKey = publicKeyRaw => {
  const publicKey = publicKeyRaw.replace(/^0x/, '')
  if (!publicKey || publicKey.length !== 130) return

  // Public key bytes from hex string
  const pubKeyBytes = decodeBase16(publicKey)
  // Remove one byte from pk bytes and hash
  const pkHash = keccak256(pubKeyBytes.slice(1))
  // Take last 40 chars from hashed pk (ETH address)
  const pkHash40 = pkHash.slice(-40)

  // Return both REV and ETH address
  return {
    revAddr: getAddrFromEth(pkHash40),
    ethAddr: pkHash40,
  }
}

export const getAddrFromPrivateKey = privateKeyRaw => {
  const privateKey = privateKeyRaw.replace(/^0x/, '')
  if (!privateKey || privateKey.length !== 64) return

  // Generate REV address from private key
  const key       = secp256k1.keyFromPrivate(privateKey)
  const pubKey = key.getPublic('hex')
  const addr      = getAddrFromPublicKey(pubKey)

  // Return public key, REV and ETH address
  return { pubKey, ...addr }
}

export const newRevAddr = () => {
  // Generate new key and REV address from it
  const key     = secp256k1.genKeyPair()
  const privKey = key.getPrivate('hex')
  const addr    = getAddrFromPrivateKey(privKey)

  // Return public key, REV and ETH address
  return { privKey, ...addr }
}

export const verifyRevAddr = revAddr => {
  const revBytes = safeDecodeBase58(revAddr)
  if (!revBytes) return

  // Extract payload and checksum
  const revHex   = encodeBase16(revBytes)
  const payload  = revHex.slice(0, -8) // without checksum
  const checksum = revHex.slice(-8)    // without payload
  // Calculate checksum
  const payloadBytes = decodeBase16(payload)
  const checksumCalc = blake.blake2bHex(payloadBytes, void 666, 32).slice(0, 8)

  return checksum === checksumCalc
}
