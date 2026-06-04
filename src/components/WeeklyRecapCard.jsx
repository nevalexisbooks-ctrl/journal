// ─── Card Weekly Recap (Homepage) ────────────────────────────────────────────
// Carica da Firestore:
//   - giorni/{YYYY-MM-DD} per 7 giorni → calcola voto giornaliero
//   - settimane/{YYYY-WNN}  → mostra goals settimanali (max 4)
// Si ricarica al mount (l'app smonta/rimonta questa card quando si torna da
// DetailScreen o WeeklyRecapScreen, quindi i dati sono sempre aggiornati).
import React, { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  toDateKey, toWeekKey, getMonday, getWeekDays,
  todayWeekIndex, calcDayScore, isFutureKey,
} from '../utils/calcWidgets.js'
import styles from './WeeklyRecapCard.module.css'

const GIORNI_LABELS = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

export default function WeeklyRecapCard({ onClick }) {
  const [scores, setScores]  = useState(Array(7).fill(null))  // voti 0-6
  const [goals,  setGoals]   = useState([])                   // goals settimanali
  const todayIdx             = todayWeekIndex()

  useEffect(() => {
    const monday  = getMonday(new Date())
    const weekDays = getWeekDays(monday)
    const weekKey  = toWeekKey(monday)

    // ── Carica voti giornalieri ───────────────────────────────────────
    async function loadScores() {
      const keys  = weekDays.map(d => toDateKey(d))
      const snaps = await Promise.all(keys.map(k => getDoc(doc(db, 'giorni', k))))
      const calcolati = snaps.map((snap, i) =>
        isFutureKey(keys[i]) ? null : (snap.exists() ? calcDayScore(snap.data()) : null)
      )
      setScores(calcolati)
    }

    // ── Carica goals settimanali ──────────────────────────────────────
    async function loadGoals() {
      const snap = await getDoc(doc(db, 'settimane', weekKey))
      if (snap.exists()) {
        setGoals(snap.data().goals ?? [])
      } else {
        setGoals([])
      }
    }

    loadScores()
    loadGoals()
  }, [])

  return (
    <article
      className={styles.card}
      role="button"
      tabIndex={0}
      aria-label="Weekly recap"
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      <p className={styles.title}>Weekly recap</p>

      {/* Goals settimanali (max 4 righe per lo spazio della card) */}
      <ul className={styles.taskList}>
        {goals.length > 0
          ? goals.slice(0, 4).map((g) => (
              <li key={g.id} className={g.done ? styles.taskDone : ''}>
                <div className={`${styles.checkbox} ${g.done ? styles.checked : ''}`} />
                {g.text}
              </li>
            ))
          : /* Placeholder se non ci sono goals */
            [1, 2, 3, 4].map(i => (
              <li key={i} className={styles.taskPlaceholder}>
                <div className={styles.checkbox} />
                <span>—</span>
              </li>
            ))
        }
      </ul>

      {/* Striscia giorni + voti */}
      <div className={styles.weekStripWrapper}>
        <div className={styles.weekStrip}>
          {GIORNI_LABELS.map((g, i) => (
            <div
              key={i}
              className={`${styles.weekCell} ${i === todayIdx ? styles.today : ''}`}
            >
              <span className={styles.weekLetter}>{g}</span>
              <span className={styles.weekScore}>
                {scores[i] !== null ? scores[i] : '·'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}
