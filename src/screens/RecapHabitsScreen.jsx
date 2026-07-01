// ─── RecapHabitsScreen — Griglia completamento habit mensile ─────────────────
// Colonne = tutte le habit (Key Habits + Small Habits combinate).
// Righe = giorni del mese selezionato.
// Celle colorate (verde) se la habit è stata completata, bianche se non,
// trasparenti se il giorno è fuori dal periodo di validità della habit o futuro.
import React, { useState, useEffect, useCallback } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { toDateKey } from '../utils/calcWidgets.js'
// Riusa lo stesso CSS della griglia RecapHabit (layout identico)
import styles from './RecapHabitScreen.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function isFuture(year, month, day) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return new Date(year, month, day) > today
}

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('it-IT', {
    month: 'long', year: 'numeric',
  })
}

function isInRange(habit, dateKey) {
  if (habit.startDate && dateKey < habit.startDate) return false
  if (habit.endDate   && dateKey >= habit.endDate)  return false
  return true
}

const DONE_COLOR   = '#8A9E85'
const FUTURE_COLOR = '#F2EDE6'

// ── Componente principale ─────────────────────────────────────────────────────

export default function RecapHabitsScreen({ onBack }) {
  const now = new Date()
  const [year,      setYear]      = useState(now.getFullYear())
  const [month,     setMonth]     = useState(now.getMonth())
  const [allHabits, setAllHabits] = useState([])  // [{id, text, startDate, endDate, type}]
  const [data,      setData]      = useState({})   // { 'YYYY-MM-DD': dayDoc | null }
  const [loading,   setLoading]   = useState(false)

  // Carica configurazioni habit una sola volta
  useEffect(() => {
    async function loadConfigs() {
      const [smallSnap, keySnap] = await Promise.all([
        getDoc(doc(db, 'settings', 'habits')),
        getDoc(doc(db, 'settings', 'keyHabits')),
      ])
      const small = smallSnap.exists() ? (smallSnap.data().habits    ?? []) : []
      const key   = keySnap.exists()   ? (keySnap.data().keyHabits   ?? []) : []
      setAllHabits([
        ...key.map(h   => ({ ...h, type: 'key' })),
        ...small.map(h => ({ ...h, type: 'small' })),
      ])
    }
    loadConfigs()
  }, [])

  const loadMonth = useCallback(async (y, m) => {
    setLoading(true)
    const numDays = daysInMonth(y, m)
    const keys = Array.from({ length: numDays }, (_, i) =>
      toDateKey(new Date(y, m, i + 1))
    )
    try {
      const snaps = await Promise.all(keys.map(k => getDoc(doc(db, 'giorni', k))))
      const map = {}
      snaps.forEach((snap, i) => { map[keys[i]] = snap.exists() ? snap.data() : null })
      setData(map)
    } catch (err) {
      console.warn('RecapHabits: errore caricamento', err)
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
  const label   = monthLabel(year, month)

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

        <p className={styles.headerTitle}>Recap Habits</p>

        <div className={styles.monthNav}>
          <button className={styles.navArrow} onClick={prevMonth} aria-label="Mese precedente">‹‹</button>
          <span className={styles.monthLabel}>
            {label.charAt(0).toUpperCase() + label.slice(1)}
          </span>
          <button className={styles.navArrow} onClick={nextMonth} aria-label="Mese successivo">››</button>
        </div>
      </header>

      {/* ══ GRIGLIA ══════════════════════════════════════════════ */}
      <main className={styles.main}>
        {loading && <p className={styles.loadingMsg}>Caricamento…</p>}

        {!loading && allHabits.length === 0 && (
          <p className={styles.loadingMsg}>Nessuna habit configurata nelle Impostazioni.</p>
        )}

        {allHabits.length > 0 && (
          <div className={styles.tableWrapper}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>

                <thead>
                  <tr>
                    <th className={styles.thDay}>Giorno</th>
                    {allHabits.map(h => (
                      <th key={`${h.type}-${h.id}`} className={styles.thHabit}>
                        {h.text || '—'}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {Array.from({ length: numDays }, (_, i) => {
                    const day     = i + 1
                    const dateKey = toDateKey(new Date(year, month, day))
                    const dayDoc  = data[dateKey] ?? null
                    const future  = isFuture(year, month, day)

                    return (
                      <tr key={day} className={day % 2 === 0 ? styles.rowEven : ''}>
                        <td className={styles.tdDay}>{day}</td>
                        {allHabits.map(habit => {
                          const inRange = isInRange(habit, dateKey)
                          let bg = 'transparent'

                          if (future) {
                            bg = inRange ? FUTURE_COLOR : 'transparent'
                          } else if (inRange) {
                            if (!dayDoc) {
                              bg = 'transparent'
                            } else {
                              const list = habit.type === 'key'
                                ? (dayDoc.keyHabits ?? [])
                                : (dayDoc.habits    ?? [])
                              const done = list.find(h => h.id === habit.id)?.done ?? false
                              bg = done ? DONE_COLOR : '#FFFFFF'
                            }
                          }

                          return (
                            <td key={`${habit.type}-${habit.id}`} className={styles.tdCell}>
                              <div className={styles.cell} style={{ background: bg }} />
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
        )}

        {/* ══ LEGENDA ══════════════════════════════════════════════ */}
        <section className={styles.legend}>
          <h3 className={styles.legendTitle}>Legenda</h3>

          <div className={styles.legendRow}>
            <span className={styles.legendName}>Completata</span>
            <div className={styles.legendBinary}>
              <span className={styles.legendSwatch} style={{ background: DONE_COLOR }} />
              <span className={styles.legendMin}>✓ fatto</span>
            </div>
          </div>

          <div className={styles.legendRow}>
            <span className={styles.legendName}>Non completata</span>
            <div className={styles.legendBinary}>
              <span className={styles.legendSwatch} style={{ background: '#fff', border: '1px solid #ddd' }} />
              <span className={styles.legendMin}>○ non fatto</span>
            </div>
          </div>

          <div className={styles.legendRow}>
            <span className={styles.legendName}>Fuori periodo / futuro / no dati</span>
            <div className={styles.legendBinary}>
              <span className={styles.legendSwatch} style={{ background: 'transparent', border: '1px dashed #bbb' }} />
              <span className={styles.legendMin}>trasparente</span>
            </div>
          </div>
        </section>

      </main>
    </div>
  )
}
