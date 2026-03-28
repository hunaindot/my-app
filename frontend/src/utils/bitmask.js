/**
 * utils/bitmask.js
 *
 * All filtering is client-side. No API call needed for counts or scatterplot.
 * One .bin file per label value. Format: packed uint8, 1 bit per record.
 */

// Popcount lookup table for fast bit counting
const POPCOUNT = new Uint8Array(256)
for (let i = 0; i < 256; i++) {
  let x = i, n = 0
  while (x) { n += x & 1; x >>= 1 }
  POPCOUNT[i] = n
}

/** Load all bitmasks defined in info.json into a flat key → Uint8Array map */
export async function loadAllBitmasks(info, basePath = './data/bitmasks/') {
  const entries = []
  for (const [groupKey, group] of Object.entries(info.groups)) {
    for (const labelKey of Object.keys(group.labels)) {
      // labelKey is e.g. "drivers|0"
      entries.push(
        fetch(`${basePath}${labelKey.replace('|', '__')}.bin`)
          .then(r => r.arrayBuffer())
          .then(buf => [labelKey, new Uint8Array(buf)])
      )
    }
  }
  const results = await Promise.all(entries)
  return Object.fromEntries(results)
}

/**
 * Compute the combined filter mask from activeFilters.
 * Semantics: OR within a group, AND between groups.
 *
 * activeFilters: { drivers: Set([0, 2]), realm: Set([1]) }
 * info: { groups: { drivers: { labels: { 'drivers|0': {...}, ... } } } }
 */
export function computeFilterMask(bitmasks, activeFilters, info) {
  const groupKeys = Object.keys(activeFilters)
  if (groupKeys.length === 0) return null  // no filter = show all

  const byteLength = Object.values(bitmasks)[0]?.length ?? 0
  let result = null

  for (const groupKey of groupKeys) {
    const selectedIndices = activeFilters[groupKey]
    if (!selectedIndices || selectedIndices.size === 0) continue

    // OR within this group
    const groupMask = new Uint8Array(byteLength)
    for (const labelIdx of selectedIndices) {
      const key = `${groupKey}|${labelIdx}`
      const mask = bitmasks[key]
      if (!mask) continue
      for (let j = 0; j < byteLength; j++) groupMask[j] |= mask[j]
    }

    // AND with running result
    if (result === null) {
      result = groupMask
    } else {
      for (let j = 0; j < byteLength; j++) result[j] &= groupMask[j]
    }
  }

  return result
}

/** Count set bits in a mask */
export function countBits(mask) {
  if (!mask) return 0
  let n = 0
  for (const b of mask) n += POPCOUNT[b]
  return n
}

/**
 * Extract the indices of all set bits.
 * Returns an Int32Array of record indices in slim.arrow order.
 */
export function getIndices(mask) {
  if (!mask) return null
  const indices = []
  for (let i = 0; i < mask.length; i++) {
    let b = mask[i]
    let base = i * 8
    while (b) {
      const bit = b & (-b)          // lowest set bit
      indices.push(base + Math.log2(bit))
      b ^= bit
    }
  }
  return new Int32Array(indices)
}

/**
 * For a given group + label, count how many records are in the
 * CURRENT filtered set that also have this label.
 * Used to show live counts on filter chips.
 */
export function countWithinFilter(filteredMask, labelMask, byteLength) {
  if (!filteredMask) return countBits(labelMask)
  let n = 0
  for (let i = 0; i < byteLength; i++) n += POPCOUNT[filteredMask[i] & labelMask[i]]
  return n
}

/**
 * Build a bitmask for records whose year falls within [minYear, maxYear].
 * Returns null if the range covers everything (no filtering needed).
 */
export function computeYearMask(arrowData, yearRange, info) {
  if (!arrowData || !yearRange) return null
  const [minYear, maxYear] = yearRange
  if (minYear <= info.start_year && maxYear >= info.end_year) return null
  const n = arrowData.length
  const byteLen = Math.ceil(n / 8)
  const mask = new Uint8Array(byteLen)
  for (let i = 0; i < n; i++) {
    if (arrowData.year[i] >= minYear && arrowData.year[i] <= maxYear) {
      mask[i >> 3] |= 1 << (i & 7)
    }
  }
  return mask
}

/**
 * AND two optional masks. null = "all records pass".
 */
export function combineMasks(a, b) {
  if (!a && !b) return null
  if (!a) return b
  if (!b) return a
  const result = new Uint8Array(a)
  for (let i = 0; i < result.length; i++) result[i] &= b[i]
  return result
}
