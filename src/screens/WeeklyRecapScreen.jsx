// ─── WeeklyRecapScreen ───────────────────────────────────────────────────────
// Schermata settimanale completa.
// Firestore:
//   - giorni/{YYYY-MM-DD}    → voti giornalieri (calcDayScore)
//   - settimane/{YYYY-WNN}   → goals, menu, note settimanali
// Auto-save debounced 600ms per goals/menu/note.
import React, { useState, useEffect, useRef } from 'react'
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  toDateKey, toWeekKey, getMonday, getWeekDays,
  formatWeekRange, todayWeekIndex, calcDayScore,
} from '../utils/calcWidgets.js'
import styles from './WeeklyRecapScreen.module.css'

// ════════════════════════════════════════════════════════════════
//  COSTANTI
// ════════════════════════════════════════════════════════════════

const GIORNI_LABELS   = ['L', 'M', 'M', 'G', 'V', 'S', 'D']
const GIORNI_NOMI     = ['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica']

const DEFAULT_MENU    = Array.from({ length: 7 }, () => ({ pranzo: '', cena: '' }))
const DEFAULT_GOALS   = []
const DEFAULT_NOTE    = ''

// ════════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPALE
// ════════════════════════════════════════════════════════════════

export default function WeeklyRecapScreen({ onBack }) {
  // ── Settimana visualizzata ────────────────────────────────────
  const [currentMonday, setCurrentMonday] = useState(() => getMonday(new Date()))
  const todayIdx = todayWeekIndex()

  const weekDays  = getWeekDays(currentMonday)
  const weekKey   = toWeekKey(currentMonday)
  const weekRange = formatWeekRange(currentMonday)

  // ── Voti giornalieri (array 7 elementi, null = nessun dato) ──
  const [scores, setScores] = useState(Array(7).fill(null))

  // ── Dati settimana (da `settimane/{weekKey}`) ─────────────────
  const [goals,  setGoals]  = useState(DEFAULT_GOALS)
  const [menu,   setMenu]   = useState(DEFAULT_MENU)
  const [note,   setNote]   = useState(DEFAULT_NOTE)

  // ── UI: aggiunta/modifica/elimina goals ──────────────────────
  const [addingGoal,   setAddingGoal]   = useState(false)
  const [newGoalText,  setNewGoalText]  = useState('')
  const [editingGoalId,  setEditingGoalId]  = useState(null)
  const [editingGoalTxt, setEditingGoalTxt] = useState('')
  const [selectedGoalId, setSelectedGoalId] = useState(null)

  // ── Refs controllo save ───────────────────────────────────────
  const dataReadyRef = useRef(false)
  const saveTimerRef = useRef(null)
  const loadedKeyRef = useRef('')

  // ════════════════════════════════════════════════════════════
  //  CARICAMENTO — al cambio settimana
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    dataReadyRef.current = false
    clearTimeout(saveTimerRef.current)
    let cancelled = false
    const wKey = toWeekKey(currentMonday)
    const days  = getWeekDays(currentMonday)

    async function loadAll() {
      try {
        // Voti giornalieri: 7 getDoc paralleli
        const daySnaps = await Promise.all(
          days.map(d => getDoc(doc(db, 'giorni', toDateKey(d))))
        )
        if (cancelled) return
        setScores(daySnaps.map(s => s.exists() ? calcDayScore(s.data()) : null))

        // Dati settimanali
        const weekSnap = await getDoc(doc(db, 'settimane', wKey))
        if (cancelled) return
        if (weekSnap.exists()) {
          const d = weekSnap.data()
          setGoals(d.goals ?? DEFAULT_GOALS)
          setMenu(mergeMenu(d.menu))
          setNote(d.note ?? DEFAULT_NOTE)
        } else {
          setGoals(DEFAULT_GOALS)
          setMenu(DEFAULT_MENU)
          setNote(DEFAULT_NOTE)
        }
      } catch (err) {
        console.error('Errore caricamento settimana:', err)
      } finally {
        if (!cancelled) {
          loadedKeyRef.current = wKey
          dataReadyRef.current = true
        }
      }
    }

    loadAll()
    return () => { cancelled = true }
  }, [currentMonday]) // eslint-disable-line

  /** Normalizza il menu da Firestore (può avere meno di 7 elementi) */
  function mergeMenu(saved) {
    if (!saved || !Array.isArray(saved)) return DEFAULT_MENU
    return Array.from({ length: 7 }, (_, i) => ({
      pranzo: saved[i]?.pranzo ?? '',
      cena:   saved[i]?.cena   ?? '',
    }))
  }

  // ════════════════════════════════════════════════════════════
  //  AUTO-SAVE debounced 600ms
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!dataReadyRef.current) return
    const wKey = toWeekKey(currentMonday)
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (wKey !== loadedKeyRef.current) return
      try {
        await setDoc(
          doc(db, 'settimane', wKey),
          { goals, menu, note },
          { merge: true }
        )
      } catch (err) {
        console.error('Errore salvataggio settimana:', err)
      }
    }, 600)
    return () => clearTimeout(saveTimerRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals, menu, note])

  // ════════════════════════════════════════════════════════════
  //  NAVIGAZIONE SETTIMANA
  // ════════════════════════════════════════════════════════════

  const prevWeek = () => setCurrentMonday(m => { const d = new Date(m); d.setDate(d.getDate() - 7); return d })
  const nextWeek = () => setCurrentMonday(m => { const d = new Date(m); d.setDate(d.getDate() + 7); return d })

  // ════════════════════════════════════════════════════════════
  //  HANDLERS — GOALS
  // ════════════════════════════════════════════════════════════

  const toggleGoal = (id) =>
    setGoals(prev => prev.map(g => g.id === id ? { ...g, done: !g.done } : g))

  const confirmNewGoal = () => {
    const text = newGoalText.trim()
    if (text) setGoals(prev => [...prev, { id: Date.now(), text, done: false }])
    setNewGoalText(''); setAddingGoal(false)
  }

  const startEditGoal = (g) => {
    setEditingGoalId(g.id); setEditingGoalTxt(g.text); setSelectedGoalId(null)
  }

  const confirmEditGoal = () => {
    if (!editingGoalId) return
    const text = editingGoalTxt.trim()
    if (text) setGoals(prev => prev.map(g => g.id === editingGoalId ? { ...g, text } : g))
    setEditingGoalId(null); setEditingGoalTxt('')
  }

  const deleteGoal = (id) => {
    setGoals(prev => prev.filter(g => g.id !== id))
    if (selectedGoalId === id) setSelectedGoalId(null)
  }

  // ════════════════════════════════════════════════════════════
  //  HANDLERS — MENU
  // ════════════════════════════════════════════════════════════

  const setMenuField = (dayIdx, field) => (e) =>
    setMenu(prev => prev.map((d, i) => i === dayIdx ? { ...d, [field]: e.target.value } : d))

  // ════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════

  return (
    <div className={styles.screen}>

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={onBack} aria-label="Torna alla Homepage">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <p className={styles.headerTitle}>Weekly Recap</p>

        <div className={styles.weekNav}>
          <button className={styles.navArrow} onClick={prevWeek} aria-label="Settimana precedente">‹‹</button>
          <span className={styles.weekLabel}>{weekRange}</span>
          <button className={styles.navArrow} onClick={nextWeek} aria-label="Settimana successiva">››</button>
        </div>
      </header>

      {/* ══ CONTENUTO ═══════════════════════════════════════════ */}
      <main className={styles.main}>

        {/* ── STRISCIA VOTI ───────────────────────────────────── */}
        <section className={styles.cardWhite}>
          <div className={styles.scoreStrip}>
            {GIORNI_LABELS.map((g, i) => (
              <div
                key={i}
                className={`${styles.scoreCell} ${i === todayIdx && toWeekKey(new Date()) === weekKey ? styles.scoreToday : ''}`}
              >
                <span className={styles.scoreLetter}>{g}</span>
                <span className={styles.scoreValue}>
                  {scores[i] !== null ? scores[i] : '·'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── WEEKLY GOAL COMPLETED ───────────────────────────── */}
        <section className={styles.cardSand}>
          <h2 className={styles.blockTitle}>Weekly goal completed</h2>

          <ul className={styles.goalList}>
            {goals.map(g => (
              <li
                key={g.id}
                className={[
                  styles.goalItem,
                  g.done              ? styles.goalDone     : '',
                  selectedGoalId === g.id ? styles.goalSelected : '',
                ].join(' ')}
                onClick={() => {
                  if (editingGoalId === g.id) return
                  setSelectedGoalId(prev => prev === g.id ? null : g.id)
                }}
              >
                <button
                  className={`${styles.goalCheck} ${g.done ? styles.goalChecked : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggleGoal(g.id) }}
                  aria-label="Toggle goal"
                />

                {editingGoalId === g.id ? (
                  <input
                    className={styles.goalEditInput}
                    autoFocus
                    value={editingGoalTxt}
                    onChange={e => setEditingGoalTxt(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  confirmEditGoal()
                      if (e.key === 'Escape') { setEditingGoalId(null); setEditingGoalTxt('') }
                    }}
                    onBlur={confirmEditGoal}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className={styles.goalText}>{g.text}</span>
                )}

                {editingGoalId !== g.id && (
                  <div className={`${styles.goalActions} ${selectedGoalId === g.id ? styles.goalActionsVisible : ''}`}>
                    <button
                      className={styles.actionBtn}
                      onClick={(e) => { e.stopPropagation(); startEditGoal(g) }}
                      title="Modifica"
                    >✏️</button>
                    <button
                      className={`${styles.actionBtn} ${styles.actionDelete}`}
                      onClick={(e) => { e.stopPropagation(); deleteGoal(g.id) }}
                      title="Elimina"
                    >✕</button>
                  </div>
                )}
              </li>
            ))}

            {/* Aggiungi nuova goal */}
            <li className={styles.goalAddRow}>
              {addingGoal ? (
                <input
                  className={styles.goalInput}
                  autoFocus
                  value={newGoalText}
                  onChange={e => setNewGoalText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmNewGoal()}
                  onBlur={confirmNewGoal}
                  placeholder="Nuova goal settimanale…"
                />
              ) : (
                <button className={styles.addBtn} onClick={() => setAddingGoal(true)}>
                  · · ·
                </button>
              )}
            </li>
          </ul>
        </section>

        {/* ── DUE QUADRANTI: MENU + NOTE ──────────────────────── */}
        <div className={styles.twoByTwo}>

          {/* Menù — salvia chiaro */}
          <section className={styles.quadSage}>
            <h3 className={styles.quadTitle}>Menù</h3>
            {/* TODO: dati menù NON passati alla chat AI (privacy alimentare) */}
            <div className={styles.menuList}>
              {GIORNI_NOMI.map((nome, i) => (
                <div key={i} className={styles.menuDay}>
                  <p className={styles.menuDayName}>{nome}</p>
                  <div className={styles.menuRow}>
                    <label className={styles.menuLabel}>Pranzo</label>
                    <input
                      className={styles.menuInput}
                      type="text"
                      value={menu[i]?.pranzo ?? ''}
                      onChange={setMenuField(i, 'pranzo')}
                      placeholder="—"
                    />
                  </div>
                  <div className={styles.menuRow}>
                    <label className={styles.menuLabel}>Cena</label>
                    <input
                      className={styles.menuInput}
                      type="text"
                      value={menu[i]?.cena ?? ''}
                      onChange={setMenuField(i, 'cena')}
                      placeholder="—"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Note — bianco (disponibili come contesto per chat AI) */}
          {/* TODO: AI — passare il contenuto di `note` come contesto alla chat */}
          <section className={styles.quadWhite}>
            <h3 className={styles.quadTitle}>Note</h3>
            <textarea
              className={styles.noteArea}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Scrivi qualcosa…"
              rows={12}
            />
          </section>

        </div>

      </main>
    </div>
  )
}
