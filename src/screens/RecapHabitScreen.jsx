// ─── RecapHabitScreen — Griglia colore abitudini mensile ────────────────────
// Legge da Firestore giorni/{YYYY-MM-DD} tutti i giorni del mese selezionato.
// Ogni cella è colorata per interpolazione in base al valore del campo.
import React, { useState, useEffect, useCallback } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { toDateKey } from '../utils/calcWidgets.js'
import styles from './RecapHabitScreen.module.css'

// ── Helpers date ──────────────────────────────────────────────────────────────

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function isFuture(year, month, day) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(year, month, day)
  return d > today
}

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('it-IT', {
    month: 'long', year: 'numeric',
  })
}

// ── Helpers colore ────────────────────────────────────────────────────────────

/** Interpola tra hex #RRGGBB in base a t ∈ [0,1] */
function lerpHex(hex1, hex2, t) {
  const parse = (h) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]
  const [r1, g1, b1] = parse(hex1)
  const [r2, g2, b2] = parse(hex2)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return `rgb(${r},${g},${b})`
}

const FUTURE_COLOR  = '#F2EDE6'   // sfondo app — giorni futuri
const NO_DATA_COLOR = 'transparent' // valore zero/assente — cella invisibile

// Acqua: fasce (stesse della Homepage) → %
function waterPct(litri) {
  const l = Number(litri) || 0
  if (l < 0.5)   return 0
  if (l < 0.625) return 5
  if (l < 0.875) return 10
  if (l < 1.125) return 20
  if (l < 1.375) return 30
  if (l < 1.625) return 40
  if (l < 1.875) return 50
  if (l < 2.125) return 60
  if (l < 2.375) return 70
  if (l < 2.625) return 80
  if (l < 2.875) return 90
  if (l < 3.0)   return 95
  return 100
}

const COLS = [
  {
    key: 'acqua',
    label: 'Acqua',
    unit: 'L',
    colorFn: (ch) => {
      if (ch.acqua == null || ch.acqua === '') return null
      const pct = waterPct(ch.acqua) / 100
      if (pct === 0) return null   // <0.5L → trasparente come non inserito
      return lerpHex('#FFFFFF', '#5B9BD5', pct)
    },
    tooltip: (ch) => ch.acqua != null && ch.acqua !== '' ? `${ch.acqua}L` : null,
    legendFrom: '0L',
    legendTo: '≥3L',
    colorFrom: '#FFFFFF',
    colorTo: '#5B9BD5',
  },
  {
    key: 'passi',
    label: 'Passi',
    unit: '',
    colorFn: (ch) => {
      if (ch.passi == null || ch.passi === '') return null
      const v = Number(ch.passi) || 0
      if (v === 0) return null   // 0 passi → trasparente
      const t = Math.min(1, v / 10000)
      return lerpHex('#FFFFFF', '#8A9E85', t)
    },
    tooltip: (ch) => ch.passi != null && ch.passi !== '' ? `${ch.passi} passi` : null,
    legendFrom: '0',
    legendTo: '10.000',
    colorFrom: '#FFFFFF',
    colorTo: '#8A9E85',
  },
  {
    key: 'social',
    label: 'Social',
    unit: 'min',
    // Scala invertita: 0 min = rosso pieno, 125+ min = bianco
    colorFn: (ch) => {
      if (ch.social == null || ch.social === '') return null
      const v = Number(ch.social) || 0
      const t = Math.min(1, v / 125)
      // t=0 → rosso, t=1 → bianco
      return lerpHex('#E05555', '#FFFFFF', t)
    },
    tooltip: (ch) => ch.social != null && ch.social !== '' ? `${ch.social} min social` : null,
    legendFrom: '0 min',
    legendTo: '≥125 min',
    colorFrom: '#E05555',
    colorTo: '#FFFFFF',
  },
  {
    key: 'cyclette',
    label: 'Cyclette',
    unit: 'min',
    colorFn: (ch) => {
      if (ch.cyclette == null || ch.cyclette === '') return null
      const v = Number(ch.cyclette) || 0
      if (v === 0) return null   // 0 min → trasparente
      const t = Math.min(1, v / 60)
      return lerpHex('#FFFFFF', '#E8956D', t)
    },
    tooltip: (ch) => ch.cyclette != null && ch.cyclette !== '' ? `${ch.cyclette} min cyclette` : null,
    legendFrom: '0 min',
    legendTo: '≥60 min',
    colorFrom: '#FFFFFF',
    colorTo: '#E8956D',
  },
  {
    key: 'yoga',
    label: 'Yoga',
    unit: 'min',
    colorFn: (ch) => {
      if (ch.yoga == null || ch.yoga === '') return null
      const v = Number(ch.yoga) || 0
      if (v === 0) return null   // 0 min → trasparente
      const t = Math.min(1, v / 60)
      return lerpHex('#FFFFFF', '#9B72CF', t)
    },
    tooltip: (ch) => ch.yoga != null && ch.yoga !== '' ? `${ch.yoga} min yoga` : null,
    legendFrom: '0 min',
    legendTo: '≥60 min',
    colorFrom: '#FFFFFF',
    colorTo: '#9B72CF',
  },
  {
    key: 'umore',
    label: 'Umore',
    unit: '/10',
    colorFn: (_, dayData) => {
      const v = Number(dayData?.umore?.voto)
      if (!v) return null
      const t = (v - 1) / 9   // 1→0, 10→1
      return lerpHex('#FFFFFF', '#D4A843', t)
    },
    tooltip: (_, dayData) => dayData?.umore?.voto != null ? `Umore ${dayData.umore.voto}/10` : null,
    legendFrom: '1/10',
    legendTo: '10/10',
    colorFrom: '#FFFFFF',
    colorTo: '#D4A843',
  },
  {
    key: 'sonno',
    label: 'Sonno',
    unit: 'h',
    colorFn: (_, dayData) => {
      const sn = dayData?.sonno ?? {}
      if (!sn.dalle || !sn.alle) return null
      const [dh, dm] = sn.dalle.split(':').map(Number)
      const [ah, am] = sn.alle.split(':').map(Number)
      let mins = (ah * 60 + am) - (dh * 60 + dm)
      if (mins < 0) mins += 1440
      const ore = mins / 60
      // Curva a campana: picco a 8h
      const t = ore <= 8
        ? Math.min(1, ore / 8)
        : Math.max(0, 1 - (ore - 8) / 4)
      return lerpHex('#FFFFFF', '#6B8CAE', t)
    },
    tooltip: (_, dayData) => {
      const sn = dayData?.sonno ?? {}
      if (!sn.dalle || !sn.alle) return null
      const [dh, dm] = sn.dalle.split(':').map(Number)
      const [ah, am] = sn.alle.split(':').map(Number)
      let mins = (ah * 60 + am) - (dh * 60 + dm)
      if (mins < 0) mins += 1440
      const h = Math.floor(mins / 60)
      const m = mins % 60
      return m > 0 ? `${h}h ${m}min` : `${h}h`
    },
    legendFrom: '0h / 12h+',
    legendTo: '8h (picco)',
    colorFrom: '#FFFFFF',
    colorTo: '#6B8CAE',
  },
  {
    key: 'zeroZuccheri',
    label: 'Zuccheri',
    unit: '',
    colorFn: (ch) => {
      if (ch.zeroZuccheri == null) return null         // non inserito
      return ch.zeroZuccheri ? '#7BC4A0' : '#FFFFFF'   // Sì=menta, No=bianco
    },
    tooltip: (ch) => ch.zeroZuccheri == null ? null : (ch.zeroZuccheri ? 'Zero zuccheri ✓' : 'Zuccheri No'),
    legendFrom: 'No',
    legendTo: 'Sì',
    colorFrom: '#FFFFFF',
    colorTo: '#7BC4A0',
    isBinary: true,
  },
]

// ── Componente cella ──────────────────────────────────────────────────────────

function Cell({ color, tooltipText, future }) {
  const [showTip, setShowTip] = useState(false)
  const bg = future ? FUTURE_COLOR : (color ?? NO_DATA_COLOR)

  return (
    <div
      className={styles.cell}
      style={{ background: bg }}
      onMouseEnter={() => !future && tooltipText && setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      onTouchStart={() => !future && tooltipText && setShowTip(v => !v)}
    >
      {showTip && tooltipText && (
        <span className={styles.tooltip}>{tooltipText}</span>
      )}
    </div>
  )
}

// ── Componente principale ─────────────────────────────────────────────────────

export default function RecapHabitScreen({ onBack }) {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())   // 0-based
  const [data,  setData]  = useState({})               // { 'YYYY-MM-DD': dayDoc }
  const [loading, setLoading] = useState(false)

  // Carica tutti i giorni del mese da Firestore
  const loadMonth = useCallback(async (y, m) => {
    setLoading(true)
    const numDays = daysInMonth(y, m)
    const keys = Array.from({ length: numDays }, (_, i) => {
      const d = new Date(y, m, i + 1)
      return toDateKey(d)
    })
    try {
      const snaps = await Promise.all(keys.map(k => getDoc(doc(db, 'giorni', k))))
      const map = {}
      snaps.forEach((snap, i) => {
        map[keys[i]] = snap.exists() ? snap.data() : null
      })
      setData(map)
    } catch (err) {
      console.warn('RecapHabit: errore caricamento', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadMonth(year, month) }, [year, month, loadMonth])

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else             { setMonth(m => m - 1) }
  }
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else              { setMonth(m => m + 1) }
  }

  const numDays = daysInMonth(year, month)

  return (
    <div className={styles.screen}>

      {/* ══ HEADER ═══════════════════════════════════════════════ */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={onBack} aria-label="Torna">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <p className={styles.headerTitle}>Recap Habit</p>

        <div className={styles.monthNav}>
          <button className={styles.navArrow} onClick={prevMonth} aria-label="Mese precedente">‹‹</button>
          <span className={styles.monthLabel}>
            {monthLabel(year, month).charAt(0).toUpperCase() + monthLabel(year, month).slice(1)}
          </span>
          <button className={styles.navArrow} onClick={nextMonth} aria-label="Mese successivo">››</button>
        </div>
      </header>

      {/* ══ GRIGLIA ══════════════════════════════════════════════ */}
      <main className={styles.main}>
        {loading && <p className={styles.loadingMsg}>Caricamento…</p>}

        <div className={styles.tableWrapper}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>

              {/* Intestazione colonne */}
              <thead>
                <tr>
                  <th className={styles.thDay}>Giorno</th>
                  {COLS.map(c => (
                    <th key={c.key} className={styles.thHabit}>{c.label}</th>
                  ))}
                </tr>
              </thead>

              {/* Righe giorni */}
              <tbody>
                {Array.from({ length: numDays }, (_, i) => {
                  const day    = i + 1
                  const dateKey = toDateKey(new Date(year, month, day))
                  const dayDoc  = data[dateKey] ?? null
                  const ch      = dayDoc?.challenge ?? {}
                  const future  = isFuture(year, month, day)

                  return (
                    <tr key={day} className={day % 2 === 0 ? styles.rowEven : ''}>
                      <td className={styles.tdDay}>{day}</td>
                      {COLS.map(col => {
                        const color   = future ? null : (dayDoc ? col.colorFn(ch, dayDoc) : null)
                        const tipText = future ? null : (dayDoc ? col.tooltip(ch, dayDoc) : null)
                        return (
                          <td key={col.key} className={styles.tdCell}>
                            <Cell color={color} tooltipText={tipText} future={future} />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>

            </table>
          </div>
        </div>

        {/* ══ LEGENDA ══════════════════════════════════════════════ */}
        <section className={styles.legend}>
          <h3 className={styles.legendTitle}>Legenda</h3>
          {COLS.map(col => (
            <div key={col.key} className={styles.legendRow}>
              <span className={styles.legendName}>{col.label}</span>
              {col.isBinary ? (
                <div className={styles.legendBinary}>
                  <span className={styles.legendSwatch} style={{ background: col.colorFrom }} />
                  <span className={styles.legendMin}>{col.legendFrom}</span>
                  <span className={styles.legendSep}>→</span>
                  <span className={styles.legendSwatch} style={{ background: col.colorTo }} />
                  <span className={styles.legendMax}>{col.legendTo}</span>
                </div>
              ) : (
                <div className={styles.legendGrad}>
                  <span className={styles.legendMin}>{col.legendFrom}</span>
                  <span
                    className={styles.legendBar}
                    style={{
                      background: `linear-gradient(to right, ${col.colorFrom}, ${col.colorTo})`,
                    }}
                  />
                  <span className={styles.legendMax}>{col.legendTo}</span>
                </div>
              )}
            </div>
          ))}

          {/* Legenda celle speciali */}
          <div className={styles.legendRow}>
            <span className={styles.legendName}>Zero / assente</span>
            <div className={styles.legendBinary}>
              <span className={styles.legendSwatch} style={{ background: 'transparent', border: '1px dashed #bbb' }} />
              <span className={styles.legendMin}>trasparente</span>
              <span className={styles.legendSep}>·</span>
              <span className={styles.legendSwatch} style={{ background: FUTURE_COLOR, border: '1px solid #ddd' }} />
              <span className={styles.legendMin}>giorni futuri</span>
            </div>
          </div>
        </section>

      </main>
    </div>
  )
}
