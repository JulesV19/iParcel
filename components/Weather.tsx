import {
  Sun, Cloud, CloudSun, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, CloudFog, Wind, Droplets, Thermometer,
  type LucideIcon,
} from 'lucide-react'
import { weatherCodeLabel, type WeatherData } from '@/lib/weather'

const WMO_MAP: Array<[number, LucideIcon, string]> = [
  [0,        Sun,            'text-sun'   ],
  [2,        CloudSun,       'text-sun'   ],
  [3,        Cloud,          'text-ink-3' ],
  [48,       CloudFog,       'text-ink-3' ],
  [55,       CloudDrizzle,   'text-rain'  ],
  [67,       CloudRain,      'text-rain'  ],
  [77,       CloudSnow,      'text-rain'  ],
  [82,       CloudRain,      'text-rain'  ],
  [86,       CloudSnow,      'text-rain'  ],
  [Infinity, CloudLightning, 'text-sun'   ],
]

export function WeatherIcon({ code, size, className = '' }: { code: number; size: number; className?: string }) {
  const entry = WMO_MAP.find(([max]) => code <= max) ?? WMO_MAP[WMO_MAP.length - 1]
  const Icon = entry[1]
  return <Icon size={size} strokeWidth={1.75} className={`${entry[2]} ${className}`} aria-hidden />
}

function dayLabel(dateStr: string, todayStr: string): string {
  const diff = Math.round((new Date(dateStr + 'T12:00:00').getTime() - new Date(todayStr + 'T12:00:00').getTime()) / 86_400_000)
  if (diff === 0) return 'Auj.'
  if (diff === -1) return 'Hier'
  if (diff === 1) return 'Dem.'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' })
}

const mmFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

export function WeatherPanel({ data }: { data: WeatherData }) {
  const today = data.days[data.todayIndex]
  if (!today) return null
  const days = [-2, -1, 0, 1, 2].map(o => data.days[data.todayIndex + o]).filter(Boolean)
  // Barres de pluie à l'échelle, plancher à 5 mm pour ne pas grossir une bruine
  const maxMm = Math.max(5, ...days.map(d => d.precipMm))

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h3 className="eyebrow">Météo sur la parcelle</h3>
        <span className="text-[11px] text-ink-3">Open-Meteo</span>
      </div>

      <div className="flex items-center gap-3.5">
        <WeatherIcon code={data.current.weatherCode} size={40} />
        <div className="min-w-0">
          <p className="flex items-baseline gap-2">
            <span className="text-[32px] leading-none font-semibold tracking-tight tabular-nums">{data.current.temp}°</span>
            <span className="text-sm text-ink-2 truncate">{weatherCodeLabel(data.current.weatherCode)}</span>
          </p>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
            <span className="inline-flex items-center gap-1"><Thermometer size={13} aria-hidden className="text-ink-3" />Ressenti {data.current.apparentTemp}°</span>
            <span className="inline-flex items-center gap-1"><Droplets size={13} aria-hidden className="text-ink-3" />{data.current.humidity} %</span>
            <span className="inline-flex items-center gap-1"><Wind size={13} aria-hidden className="text-ink-3" />{data.current.windKmh} km/h</span>
          </p>
        </div>
      </div>

      <ol className="grid grid-cols-5 gap-1">
        {days.map(day => {
          const isToday = day.date === today.date
          return (
            <li
              key={day.date}
              className={`flex flex-col items-center gap-1 rounded-xl py-2.5 ${isToday ? 'bg-paper-2 ring-1 ring-line' : ''}`}
            >
              <span className={`text-[11px] font-semibold ${isToday ? 'text-ink' : 'text-ink-3'}`}>{dayLabel(day.date, today.date)}</span>
              <WeatherIcon code={day.weatherCode} size={20} />
              <span className="text-[13px] font-semibold tabular-nums leading-none mt-0.5">{day.tempMax}°</span>
              <span className="text-[11px] text-ink-3 tabular-nums leading-none">{day.tempMin}°</span>
              <span className="mt-1 flex h-6 w-1.5 items-end rounded-full bg-paper-3" aria-hidden>
                <span className="w-full rounded-full bg-rain" style={{ height: `${(day.precipMm / maxMm) * 100}%` }} />
              </span>
              <span className={`text-[10px] tabular-nums ${day.precipMm > 0 ? 'text-rain' : 'text-ink-3'}`}>{mmFormat.format(day.precipMm)} mm</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
