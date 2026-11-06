import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'

/** Small procedural textures (no network assets). Created lazily, once, in the browser. */
let cache: { wood: Texture; tile: Texture; concrete: Texture } | null = null

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): Texture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!, size)
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

export function getTextures() {
  if (cache) return cache
  const wood = canvasTexture(256, (g, s) => {
    const planks = 4, ph = s / planks
    const tones = ['#b58b62', '#ab8158', '#bd946b', '#b08660']
    for (let i = 0; i < planks; i++) {
      g.fillStyle = tones[i % tones.length]
      g.fillRect(0, i * ph, s, ph)
      g.strokeStyle = 'rgba(90,60,35,0.18)'
      g.lineWidth = 1
      for (let k = 0; k < 6; k++) { g.beginPath(); const y = i * ph + ((k + 1) * ph) / 7; g.moveTo(0, y); g.lineTo(s, y + ((k % 2) * 2 - 1)); g.stroke() }
      g.fillStyle = 'rgba(60,40,25,0.55)'
      g.fillRect(0, i * ph, s, 1.5)
      g.fillRect(((i * 97) % s) | 0, i * ph, 1.5, ph)
    }
  })
  const tile = canvasTexture(128, (g, s) => {
    g.fillStyle = '#c3c0b9'; g.fillRect(0, 0, s, s)
    g.fillStyle = '#dedcd6'; g.fillRect(2, 2, s - 4, s - 4)
  })
  const concrete = canvasTexture(128, (g, s) => {
    g.fillStyle = '#cfccc5'; g.fillRect(0, 0, s, s)
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${120 + (i % 40)},${118 + (i % 40)},${112 + (i % 40)},0.12)`; g.fillRect((i * 37) % s, (i * 53) % s, 2, 2) }
  })
  cache = { wood, tile, concrete }
  return cache
}

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

/** Extra finishes for the "Colours & finishes" options (separate cache: the original textures above stay untouched). */
let extra: { marble: Texture; granite: Texture; brick: Texture; stone: Texture } | null = null

/** Small deterministic pseudo-random sequence, so textures look the same on every load. */
function rand(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

export function getExtraTextures() {
  if (extra) return extra
  const marble = canvasTexture(256, (g, s) => {
    const r = rand(7)
    g.fillStyle = '#efece6'; g.fillRect(0, 0, s, s)
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(140,135,128,${0.08 + r() * 0.18})`; g.lineWidth = 0.6 + r() * 1.6
      g.beginPath(); let x = r() * s, y = 0; g.moveTo(x, y)
      while (y < s) { x += (r() - 0.5) * 40; y += 12 + r() * 20; g.lineTo(x, y) }
      g.stroke()
    }
    g.strokeStyle = 'rgba(120,115,108,0.35)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, s - 1, s - 1)
  })
  const granite = canvasTexture(128, (g, s) => {
    const r = rand(11)
    g.fillStyle = '#4b4846'; g.fillRect(0, 0, s, s)
    for (let i = 0; i < 1600; i++) {
      const t = r()
      g.fillStyle = t < 0.45 ? 'rgba(25,24,24,0.7)' : t < 0.8 ? 'rgba(150,140,132,0.55)' : 'rgba(205,195,185,0.6)'
      g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2)
    }
    g.strokeStyle = 'rgba(15,15,15,0.5)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, s - 1, s - 1)
  })
  // brick: 4 courses, 2 bricks per course, half-bond; texture tile = 0.46 m x 0.30 m
  const brick = canvasTexture(256, (g, s) => {
    const r = rand(3)
    g.fillStyle = '#d8cfc4'; g.fillRect(0, 0, s, s)
    const rows = 4, cols = 2, h = s / rows, w = s / cols, m = 5
    for (let i = 0; i < rows; i++) for (let j = -1; j < cols; j++) {
      const x = j * w + (i % 2 ? w / 2 : 0)
      const tone = 150 + r() * 40
      g.fillStyle = `rgb(${tone + 35},${tone * 0.55},${tone * 0.42})`
      g.fillRect(x + m / 2, i * h + m / 2, w - m, h - m)
    }
  })
  const stone = canvasTexture(256, (g, s) => {
    const r = rand(5)
    g.fillStyle = '#8f8a83'; g.fillRect(0, 0, s, s)
    let y = 0
    while (y < s) {
      const h = 28 + r() * 30
      let x = -r() * 40
      while (x < s) {
        const w = 40 + r() * 70, tone = 150 + r() * 60
        g.fillStyle = `rgb(${tone},${tone * 0.96},${tone * 0.9})`
        g.fillRect(x + 3, y + 3, w - 6, Math.min(h, s - y) - 6)
        x += w
      }
      y += h
    }
  })
  extra = { marble, granite, brick, stone }
  return extra
}

/** Size in metres one texture tile covers on a wall (u along the wall, v up). */
export const WALL_TEXTURE_SIZE = { brick: [0.46, 0.3], stone: [1.2, 1.2] } as const
