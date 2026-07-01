// ─── Card Monthly View ────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { toDateKey, calcDayScore, isFutureKey, getPesiForDate } from '../utils/calcWidgets.js'
import styles from './MonthlyViewCard.module.css'

const GIORNI_HDR = ['L','M','M','G','V','S','D']

function buildCalendar() {
  const oggi      = new Date()
  const anno      = oggi.getFullYear()
  const mese      = oggi.getMonth()
  const giorno    = oggi.getDate()
  const totGiorni = new Date(anno, mese + 1, 0).getDate()

  const nomeMese = oggi.toLocaleDateString('it-IT', { month: 'long' })
  const label    = nomeMese.charAt(0).toUpperCase() + nomeMese.slice(1) + ' ' + anno

  const primoJs = new Date(anno, mese, 1).getDay()
  const offset  = primoJs === 0 ? 6 : primoJs - 1

  return { anno, mese, label, offset, totGiorni, giorno }
}

export default function MonthlyViewCard({ onClick }) {
  const [cal,    setCal]    = useState(null)
  const [scores, setScores] = useState({}) // { 'YYYY-MM-DD': number|null }

  useEffect(() => {
    const c = buildCalendar()
    setCal(c)

    // Carica voti per tutti i giorni del mese corrente
    async function loadScores() {
      const keys = Array.from({ length: c.totGiorni }, (_, i) => {
        const d = new Date(c.anno, c.mese, i + 1)
        return toDateKey(d)
      })

      const pastKeys = keys.filter(k => !isFutureKey(k))

      try {
        const [snaps, formulasSnap] = await Promise.all([
          Promise.all(pastKeys.map(k => getDoc(doc(db, 'giorni', k)))),
          getDoc(doc(db, 'settings', 'scoreFormulas')),
        ])
        const versions = formulasSnap.exists() ? (formulasSnap.data().versions ?? []) : []
        const result = {}
        pastKeys.forEach((k, i) => {
          if (!snaps[i].exists()) { result[k] = null; return }
          const pesi = getPesiForDate(versions, k)
          result[k] = calcDayScore(snaps[i].data(), pesi)
        })
        setScores(result)
      } catch (err) {
        console.error('[MonthlyView] ERRORE Firestore:', err)
      }
    }

    loadScores()
  }, [])

  return (
    <article
      className={styles.card}
      role="button"
      tabIndex={0}
      aria-label="Monthly view"
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      <p className={styles.title}>Monthly view</p>
      <p className={styles.monthLabel}>{cal?.label ?? ''}</p>

      <div className={styles.calGrid}>
        {GIORNI_HDR.map((h, i) => (
          <div key={i} className={styles.calHeaderCell}>{h}</div>
        ))}

        {cal && Array.from({ length: cal.offset }).map((_, i) => (
          <div key={`e${i}`} className={styles.calCellEmpty} />
        ))}

        {cal && Array.from({ length: cal.totGiorni }, (_, i) => i + 1).map((d) => {
          const dateKey = toDateKey(new Date(cal.anno, cal.mese, d))
          const isFuture = isFutureKey(dateKey)
          const score = scores[dateKey] ?? null
          return (
            <div
              key={d}
              className={`${styles.calCell} ${d === cal.giorno ? styles.calToday : ''}`}
            >
              <span className={styles.dayNum}>{d}</span>
              {!isFuture && score !== null && (
                <span className={styles.dayScore}>{score}</span>
              )}
            </div>
          )
        })}
      </div>
    </article>
  )
}
