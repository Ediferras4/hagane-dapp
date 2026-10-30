import { CraneMark } from '@/components/CraneMark'

/** Red circle holding the black Hagane heron. The mark is an inline SVG, so the background is transparent. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-seal"
      style={{ width: size, height: size }}
    >
      <CraneMark className="h-full w-full p-1.5 text-black" />
    </span>
  )
}
