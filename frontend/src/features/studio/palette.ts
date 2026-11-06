/** Studio colours and the automatic floor finish per room type. Plain data (no 3D engine), so light screens can use it. */
export const PALETTE = {
  wall: '#f2eee7',
  slab: '#b7b3ab',
  frame: '#fbfaf7',
  door: '#8a5d3c',
  glass: '#a9d0e8',
  stair: '#d9d4cb',
  rail: '#3f4650',
  lawn: '#9fc38a',
  path: '#d8d1c4',
  roof: '#4f5a66',
  ground: '#e6eaef',
  highlight: '#f97316',
  hover: '#3c6194',
}

export function floorKind(type: string): 'wood' | 'tile' | 'concrete' {
  if (type === 'bathroom' || type === 'kitchen' || type === 'balcony') return 'tile'
  if (['bedroom', 'living', 'dining', 'study', 'office'].includes(type)) return 'wood'
  return 'concrete'
}
