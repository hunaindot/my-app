/**
 * utils/arrow.js
 *
 * Loads slim.arrow using the apache-arrow JS library.
 * Returns a simple object with typed arrays for each column.
 */
import { tableFromIPC } from 'apache-arrow'

export async function loadArrow(url = './data/slim.arrow') {
  const response = await fetch(url)
  const buffer = await response.arrayBuffer()
  const table = tableFromIPC(new Uint8Array(buffer))

  // Extract columns into plain TypedArrays for fast access
  return {
    length: table.numRows,
    id:     table.getChild('id').toArray(),
    year:   table.getChild('year').toArray(),
    umap_x: table.getChild('umap_x').toArray(),
    umap_y: table.getChild('umap_y').toArray(),
    title:  [...table.getChild('title')],   // string column → plain array
  }
}
