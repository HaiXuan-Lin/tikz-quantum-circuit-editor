import LZString from 'lz-string'
import {parseCircuit} from './model.mjs'

export const SHARE_PREFIX = 'quantikz:v1:'
export const encode = (document) =>
  LZString.compressToEncodedURIComponent(JSON.stringify(document))
export function decode(hash) {
  const json = LZString.decompressFromEncodedURIComponent(hash)
  if (!json) throw new Error('The share data is incomplete.')
  return parseCircuit(json)
}
export function shareURL(document) {
  if (window.location.protocol === 'file:') return SHARE_PREFIX + encode(document)
  const base = window.location.href.split('#')[0]
  return `${base}#${encode(document)}`
}
