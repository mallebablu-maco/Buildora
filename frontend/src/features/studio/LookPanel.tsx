import { Palette, RotateCcw } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Select } from '@/components/ui/form'
import { cn } from '@/lib/utils'
import { DEFAULT_LOOK, EXTERIOR_FINISHES, FLOOR_FINISHES, isDefaultLook, ROOF_COLOURS, ROOF_STYLES, WALL_COLOURS, type ExteriorFinish, type FloorFinish, type Look, type RoofStyle } from './look'

function Swatches({ label, value, options, onChange }: { label: string; value: string; options: { name: string; hex: string }[]; onChange: (hex: string) => void }) {
  const custom = !options.some((o) => o.hex === value)
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => (
        <button key={o.hex} type="button" role="radio" aria-checked={o.hex === value} aria-label={o.name} title={o.name} onClick={() => onChange(o.hex)}
          className={cn('h-7 w-7 rounded-full border border-slate-300 shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-orange-400', o.hex === value && 'ring-2 ring-orange-500 ring-offset-2')}
          style={{ background: o.hex }} />
      ))}
      <label title="Custom colour" className={cn('relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-dashed border-slate-400', custom && 'ring-2 ring-orange-500 ring-offset-2')}
        style={custom ? { background: value } : { background: 'conic-gradient(#f87171,#facc15,#4ade80,#60a5fa,#c084fc,#f87171)' }}>
        <span className="sr-only">Custom colour for {label.toLowerCase()}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toLowerCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </label>
    </div>
  )
}

/** Colours and finishes of the 3D model (visual only: the estimate does not change). */
export function LookPanel({ look, onChange }: { look: Look; onChange: (l: Look) => void }) {
  const set = (patch: Partial<Look>) => onChange({ ...look, ...patch })
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Palette className="h-4 w-4 text-orange-600" /> Colours & finishes</span>}
        description="Only changes how the model looks. Press Save layout to keep it."
        action={!isDefaultLook(look) && (
          <button type="button" onClick={() => onChange(DEFAULT_LOOK)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-orange-700">
            <RotateCcw className="h-3.5 w-3.5" /> Default look
          </button>
        )} />
      <CardBody className="space-y-4 text-sm">
        <div className="space-y-2">
          <div className="font-medium text-slate-700">Outside walls</div>
          <div role="radiogroup" aria-label="Outside wall finish" className="grid grid-cols-3 gap-1 rounded-md bg-slate-100 p-1">
            {EXTERIOR_FINISHES.map((f) => (
              <button key={f.value} type="button" role="radio" aria-checked={look.exterior === f.value} onClick={() => set({ exterior: f.value as ExteriorFinish })}
                className={cn('rounded px-2 py-1 text-xs font-medium', look.exterior === f.value ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
                {f.label}
              </button>
            ))}
          </div>
          {look.exterior === 'paint' && <Swatches label="Outside wall colour" value={look.wallOut} options={WALL_COLOURS} onChange={(wallOut) => set({ wallOut })} />}
        </div>
        <div className="space-y-2">
          <div className="font-medium text-slate-700">Inside walls</div>
          <Swatches label="Inside wall colour" value={look.wallIn} options={WALL_COLOURS} onChange={(wallIn) => set({ wallIn })} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="look-floor" className="font-medium text-slate-700">Floors</label>
          <Select id="look-floor" value={look.floor} onChange={(e) => set({ floor: e.target.value as FloorFinish })} className="h-9 text-sm">
            {FLOOR_FINISHES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
          {look.floor !== 'auto' && <p className="text-xs text-slate-500">Bathrooms, kitchens and balconies keep their tiles.</p>}
        </div>
        <div className="space-y-2">
          <div className="font-medium text-slate-700">Roof <span className="font-normal text-slate-500">(turn on Roof to see it)</span></div>
          <div role="radiogroup" aria-label="Roof style" className="grid grid-cols-4 gap-1 rounded-md bg-slate-100 p-1">
            {ROOF_STYLES.map((r) => (
              <button key={r.value} type="button" role="radio" aria-checked={look.roofStyle === r.value} onClick={() => set({ roofStyle: r.value as RoofStyle })}
                className={cn('rounded px-1 py-1 text-xs font-medium', look.roofStyle === r.value ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
                {r.label}
              </button>
            ))}
          </div>
          {look.roofStyle === 'flat'
            ? <p className="text-xs text-slate-500">A flat RCC terrace with a 1 m parapet in the outside-wall finish.</p>
            : <Swatches label="Roof colour" value={look.roof} options={ROOF_COLOURS} onChange={(roof) => set({ roof })} />}
        </div>
        <div className="space-y-1.5">
          <div className="font-medium text-slate-700">Exterior details</div>
          <Toggle label="Sunshades (chajjas)" hint="Over outside windows and doors" on={look.sunshades} onChange={(sunshades) => set({ sunshades })} />
          <Toggle label="Entrance porch" hint="Canopy over the main door and a step" on={look.entrance} onChange={(entrance) => set({ entrance })} />
          <Toggle label="Garden & compound wall" hint="Lawn, boundary wall with a gate, path to the door" on={look.garden} onChange={(garden) => set({ garden })} />
        </div>
      </CardBody>
    </Card>
  )
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left hover:bg-slate-50">
      <span>
        <span className="block text-sm text-slate-700">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      <span className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', on ? 'bg-orange-500' : 'bg-slate-300')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} />
      </span>
    </button>
  )
}
