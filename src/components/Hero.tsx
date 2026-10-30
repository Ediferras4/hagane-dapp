import { CraneMark } from '@/components/CraneMark'
import './Hero.css'

const RIVER_PATH =
  'M190 250 C205 218 278 218 282 193 C287 166 215 164 224 143 C233 119 318 131 337 104 C352 82 325 67 309 61'

export function Hero() {
  return (
    <section className="hagane-hero hero">
      <div
        className="hero-art river-art"
        role="img"
        aria-label="Night landscape in the Japanese style, with mountains, a red sun and a glowing blue river"
      >
        <div className="river-sun" />
        <div className="river-cloud" />
        <div className="river-mountain rm-back" />
        <div className="river-mountain rm-mid" />
        <div className="river-mountain rm-front" />
        <div className="river-water" />
        <svg className="river-path" viewBox="0 0 500 250" preserveAspectRatio="none" aria-hidden="true">
          <path d={RIVER_PATH} />
          <path className="river-glint" d={RIVER_PATH} />
        </svg>
        <span className="river-light light-one" />
        <span className="river-light light-two" />
        <span className="river-light light-three" />
        <div className="river-ripple ripple-one" />
        <div className="river-ripple ripple-two" />
        <div className="bird-stamp" style={{ position: 'absolute', zIndex: 7, width: 64, height: 64, right: 12, bottom: 12, color: '#a9d8cc', filter: 'drop-shadow(0 0 8px rgba(134,181,169,0.6))' }}>
          <CraneMark
            className="block h-full w-full"
            // Light heron with a soft glow on the dark landscape.
          />
        </div>
        <div className="river-caption">
          {' O N E   F L O W . . .'}
        </div>
      </div>
      <div>
        <div className="eyebrow">NO HIDDEN FEES · NETWORK GAS</div>
        <h1>
          Small assets.
          <br />
          <em>One flow.</em>
        </h1>
        <p>
          Convert up to 10 eligible token balances (valued between $0.05 and $5.00) into USDC in one confirmation. No app fee, just network gas.
        </p>
      </div>
    </section>
  )
}
