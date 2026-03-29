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

// Helpers to index masks
function maskFor(bitmasks, groupKey, labelId) {
  return bitmasks?.[groupKey]?.[labelId] ?? null
}

function byteLengthOf(bitmasks) {
  const firstGroup = Object.values(bitmasks ?? {})[0]
  const firstMask = firstGroup && Object.values(firstGroup)[0]
  return firstMask?.length ?? 0
}

/** Load all bitmasks defined in info.json into a nested map group → labelId → Uint8Array */
export async function loadAllBitmasks(info, basePath = './data/bitmasks/') {
  const groupEntries = await Promise.all(Object.entries(info.groups).map(async ([groupKey, group]) => {
    const labelEntries = await Promise.all(Object.values(group.labels).map(async (label) => {
      const file = label.bitmask_file ?? `${groupKey}__${label.id}.bin`
      const res = await fetch(`${basePath}${file}`)
      const buf = await res.arrayBuffer()
      return [label.id, new Uint8Array(buf)]
    }))
    return [groupKey, Object.fromEntries(labelEntries)]
  }))
  return Object.fromEntries(groupEntries)
}

/**
 * Compute the combined filter mask from activeFilters.
 * Semantics: OR within a group, AND between groups.
 *
 * activeFilters: { drivers: Set(['drivers|0']), realm: Set(['T1']) }
 */
export function computeFilterMask(bitmasks, activeFilters, info) {
  const groupKeys = Object.keys(activeFilters)
  if (groupKeys.length === 0) return null  // no filter = show all

  const byteLength = byteLengthOf(bitmasks)
  let result = null

  for (const groupKey of groupKeys) {
    const selectedIds = activeFilters[groupKey]
    if (!selectedIds || selectedIds.size === 0) continue

    const groupMask = new Uint8Array(byteLength)
    for (const id of selectedIds) {
      const mask = maskFor(bitmasks, groupKey, id)
      if (!mask) continue
      for (let j = 0; j < byteLength; j++) groupMask[j] |= mask[j]
    }

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

/**
 * Return a flattened array of labels for a group in depth-first order.
 * Convenience for rendering tree UIs.
 */
export function flattenGroupLabels(group) {
  const labels = group.labels
  const roots = Object.values(labels).filter(l => !l.parent)
  const out = []

  function dfs(node) {
    out.push(node)
    const children = (node.children || []).map(id => labels[id]).filter(Boolean)
    children.sort((a, b) => a.name.localeCompare(b.name))
    for (const child of children) dfs(child)
  }
  roots.sort((a, b) => a.name.localeCompare(b.name))
  for (const r of roots) dfs(r)
  return out
}

/** Determine if a label should show as selected/partial for tri-state UI */
export function triState(labelId, activeSet, group) {
  if (activeSet.has(labelId)) return 'checked'
  const labels = group.labels
  const hasChild = (labels[labelId]?.children || []).some(id => triState(id, activeSet, group) !== 'none')
  return hasChild ? 'partial' : 'none'
}

/** Toggle selection respecting parent-child semantics */
export function toggleLabel(activeSet, labelId, group) {
  const next = new Set(activeSet)
  const labels = group.labels
  const removeDesc = (id) => {
    next.delete(id)
    for (const c of labels[id]?.children || []) removeDesc(c)
  }

  if (next.has(labelId)) {
    // Deselect label and all descendants
    removeDesc(labelId)
  } else {
    // Select label, remove any descendants to avoid redundancy
    removeDesc(labelId)
    next.add(labelId)
  }
  return next
}
