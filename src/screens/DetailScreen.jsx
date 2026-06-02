// ─── DetailScreen — "Nel dettaglio" ─────────────────────────────────────────
// Schermata di dettaglio giornaliero: To Do, Challenge, Sonno, Ciclo,
// Umore, Small Habits, Note.
// Tutti i dati sono in memoria React (useState). Nessun Firebase ancora.
import React, { useState, useEffect, useCallback } from 'react'
import styles from './DetailScreen.module.css'

// ════════════════════════════════════════════════════════════════
//  HELPERS — date
// ════════════════════════════════════════════════════════════════

/** Sposta una data di `delta` giorni (±) */
function shiftDay(date, delta) {
  const d = new Date(date)
  d.setDate(d.getDate() + delta)
  return d
}

/** Confronta solo giorno/mese/anno */
function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  )
}

/** Ritorna true se `date` è strettamente nel futuro (rispetto a oggi) */
function isFutureDay(date) {
  const today = new Date(); today.setHours(0,0,0,0)
  const d     = new Date(date); d.setHours(0,0,0,0)
  return d > today
}

/** Formatta la data in italiano breve: "Lun 2 giu" */
function formatDateShort(date) {
  return date.toLocaleDateString('it-IT', {
    weekday: 'short', day: 'numeric', month: 'short'
  })
}

// ════════════════════════════════════════════════════════════════
//  HELPERS — calcoli widget per Homepage
// ════════════════════════════════════════════════════════════════

/**
 * Social %: 0-5 min → 100%; per ogni 6 min oltre i 5: -5%; min 0
 */
function calcSocialPct(minutes) {
  const m = Number(minutes) || 0
  if (m <= 5) return 100
  const extra = m - 5
  return Math.max(0, 100 - Math.floor(extra / 6) * 5)
}

/**
 * Workout %: (passi/500)*3 + (cyclette/3)*4 + (yoga/3)*4; max 100
 */
function calcWorkoutPct(passi, cyclette, yoga) {
  const p = Number(passi)    || 0
  const c = Number(cyclette) || 0
  const y = Number(yoga)     || 0
  const total = (p / 500) * 3 + (c / 3) * 4 + (y / 3) * 4
  return Math.min(100, Math.round(total))
}

/**
 * Acqua %: scala a gradini definita dal brief
 */
function calcWaterPct(litri) {
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

// ════════════════════════════════════════════════════════════════
//  HELPER — calcolo ore sonno
// ════════════════════════════════════════════════════════════════

function calcSleepTotal(dalle, alle) {
  if (!dalle || !alle) return '—'
  const [h1, m1] = dalle.split(':').map(Number)
  const [h2, m2] = alle.split(':').map(Number)
  let startMin = h1 * 60 + m1
  let endMin   = h2 * 60 + m2
  if (endMin <= startMin) endMin += 1440 // mezzanotte
  const diff = endMin - startMin
  const hh   = Math.floor(diff / 60)
  const mm   = diff % 60
  return mm === 0 ? `${hh}` : `${hh}:${String(mm).padStart(2, '0')}`
}

// ════════════════════════════════════════════════════════════════
//  SVG DONUT — grafico ciclo
// ════════════════════════════════════════════════════════════════

function polarToXY(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function donutSlice(cx, cy, outerR, innerR, startDeg, endDeg) {
  const o1 = polarToXY(cx, cy, outerR, startDeg)
  const o2 = polarToXY(cx, cy, outerR, endDeg)
  const i1 = polarToXY(cx, cy, innerR, startDeg)
  const i2 = polarToXY(cx, cy, innerR, endDeg)
  const large = (endDeg - startDeg > 180) ? 1 : 0
  const fmt = (n) => n.toFixed(2)
  return (
    `M ${fmt(o1.x)} ${fmt(o1.y)} ` +
    `A ${outerR} ${outerR} 0 ${large} 1 ${fmt(o2.x)} ${fmt(o2.y)} ` +
    `L ${fmt(i2.x)} ${fmt(i2.y)} ` +
    `A ${innerR} ${innerR} 0 ${large} 0 ${fmt(i1.x)} ${fmt(i1.y)} Z`
  )
}

// Fasi ciclo (28 gg): mestruale 5gg, follicolare 8gg, ovulatoria 3gg, luteale 12gg
const CYCLE_PHASES = [
  { name: 'Mestruale',   days: 5,  color: '#E88080' },
  { name: 'Follicolare', days: 8,  color: '#8A9E85' },
  { name: 'Ovulatoria',  days: 3,  color: '#D4C070' },
  { name: 'Luteale',     days: 12, color: '#D9C9A8' },
]
const CYCLE_TOTAL = CYCLE_PHASES.reduce((s, p) => s + p.days, 0) // 28

// Placeholder: fase corrente = Follicolare (indice 1), giorno 5
const CURRENT_PHASE_IDX = 1
const CURRENT_PHASE_DAY = 5

function CycleDonut() {
  const cx = 50, cy = 50, outerR = 38, innerR = 24
  let currentAngle = 0
  const slices = CYCLE_PHASES.map((phase, i) => {
    const span      = (phase.days / CYCLE_TOTAL) * 360
    const startDeg  = currentAngle
    const endDeg    = currentAngle + span
    currentAngle    = endDeg
    const isCurrent = i === CURRENT_PHASE_IDX
    return (
      <path
        key={phase.name}
        d={donutSlice(cx, cy, isCurrent ? outerR + 4 : outerR, innerR, startDeg, endDeg)}
        fill={phase.color}
        opacity={isCurrent ? 1 : 0.55}
      />
    )
  })

  return (
    <svg viewBox="0 0 100 100" className={styles.donutSvg} aria-hidden="true">
      {slices}
    </svg>
  )
}

// ════════════════════════════════════════════════════════════════
//  DATI INIZIALI (placeholder)
// ════════════════════════════════════════════════════════════════

const TODO_INIZIALI = [
  { id: 1, text: 'Meditazione mattina', done: false },
  { id: 2, text: 'Corsa 30 minuti',     done: false },
  { id: 3, text: 'Leggere 20 pagine',   done: false },
  { id: 4, text: 'No social dopo le 22',done: false },
]

const SMALL_HABITS_INIZIALI = [
  { id: 1, label: 'Crochet',    done: false },
  { id: 2, label: 'Dry brush',  done: false },
  { id: 3, label: 'Leggere',    done: false },
  { id: 4, label: 'Stretching', done: false },
  { id: 5, label: 'Journaling', done: false },
]

const MOOD_EMOJI = ['🥰','😌','😑','🫩','🤒','🥺','🫨','😡']

// ════════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPALE
// ════════════════════════════════════════════════════════════════

export default function DetailScreen({ onBack, onDataUpdate, onTasksUpdate }) {
  // ── Data corrente navigata ──────────────────────────────────
  const [currentDate, setCurrentDate] = useState(new Date())
  const future = isFutureDay(currentDate)

  // ── To Do ──────────────────────────────────────────────────
  const [todos,       setTodos]       = useState(TODO_INIZIALI)
  const [newTodoText, setNewTodoText] = useState('')
  const [addingTodo,  setAddingTodo]  = useState(false)

  // ── Challenge Yourself ──────────────────────────────────────
  const [challenge, setChallenge] = useState({
    passi: '', acqua: '', social: '', cyclette: '', yoga: '',
    zeroZuccheri: false,
  })

  // ── Sonno ───────────────────────────────────────────────────
  const [sonno, setSonno] = useState({ dalle: '', alle: '', qualita: '' })

  // ── Umore ───────────────────────────────────────────────────
  const [emojiSel, setEmojiSel] = useState([])   // array di indici selezionati
  const [umoreVoto, setUmoreVoto] = useState('')

  // ── Small Habits ────────────────────────────────────────────
  const [habits, setHabits] = useState(SMALL_HABITS_INIZIALI)

  // ── Note ────────────────────────────────────────────────────
  const [note, setNote] = useState('')

  // ════════════════════════════════════════════════════════════
  //  EFFETTI: propagazione dati verso Homepage
  // ════════════════════════════════════════════════════════════

  /** Aggiorna widget Homepage ogni volta che challenge cambia */
  useEffect(() => {
    const data = {
      social:  calcSocialPct(challenge.social),
      workout: calcWorkoutPct(challenge.passi, challenge.cyclette, challenge.yoga),
      water:   calcWaterPct(challenge.acqua),
    }
    // TODO: Firebase — salvare challenge per la data corrente
    onDataUpdate?.(data)
  }, [challenge]) // eslint-disable-line

  /** Passa le prime 3 task non completate alla Homepage */
  useEffect(() => {
    const prime3 = todos.filter(t => !t.done).slice(0, 3)
    // TODO: Firebase — salvare todos per la data corrente
    onTasksUpdate?.(prime3)
  }, [todos]) // eslint-disable-line

  // ════════════════════════════════════════════════════════════
  //  HANDLERS
  // ════════════════════════════════════════════════════════════

  // ── Navigazione data ──
  const goBack    = () => setCurrentDate(d => shiftDay(d, -1))
  const goForward = () => setCurrentDate(d => shiftDay(d, +1))

  // ── To Do ──
  const toggleTodo = (id) =>
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))

  const confirmNewTodo = () => {
    const text = newTodoText.trim()
    if (!text) { setAddingTodo(false); return }
    // TODO: Firebase — aggiungere task con ID da Firestore
    setTodos(prev => [...prev, { id: Date.now(), text, done: false }])
    setNewTodoText('')
    setAddingTodo(false)
  }

  // ── Challenge ──
  const setField = (field) => (e) => {
    const val = field === 'zeroZuccheri' ? e.target.checked : e.target.value
    setChallenge(prev => ({ ...prev, [field]: val }))
  }

  // ── Sonno ──
  const setSonnoField = (field) => (e) =>
    setSonno(prev => ({ ...prev, [field]: e.target.value }))
  const sleepTotal = calcSleepTotal(sonno.dalle, sonno.alle)

  // ── Umore emoji ──
  const toggleEmoji = (i) =>
    setEmojiSel(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])

  // ── Small Habits ──
  const toggleHabit = (id) =>
    setHabits(prev => prev.map(h => h.id === id ? { ...h, done: !h.done } : h))

  // ════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════

  return (
    <div className={styles.screen}>

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <header className={styles.header}>

        {/* Freccia ← — torna Homepage */}
        <button className={styles.backBtn} onClick={onBack} aria-label="Torna alla Homepage">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Titolo */}
        <p className={styles.headerTitle}>Nel dettaglio...</p>

        {/* Navigazione giorno */}
        <div className={styles.dateNav}>
          <button className={styles.navArrow} onClick={goBack}  aria-label="Giorno precedente">‹‹</button>
          <span   className={styles.dateLabel}>{formatDateShort(currentDate)}</span>
          <button className={styles.navArrow} onClick={goForward} aria-label="Giorno successivo">››</button>
        </div>

        {/* Avviso data futura */}
        {future && (
          <p className={styles.futureNotice}>
            Alcuni blocchi non sono disponibili per date future
          </p>
        )}
      </header>

      {/* ══ CONTENUTO SCORREVOLE ════════════════════════════════ */}
      <main className={styles.main}>

        {/* ── TO DO ────────────────────────────────────────── */}
        <section className={styles.cardWhite}>
          <h2 className={styles.blockTitle}>To do</h2>

          <ul className={styles.todoList}>
            {todos.map(t => (
              <li key={t.id} className={`${styles.todoItem} ${t.done ? styles.todoDone : ''}`}>
                <button
                  className={`${styles.todoCheck} ${t.done ? styles.todoChecked : ''}`}
                  onClick={() => toggleTodo(t.id)}
                  aria-label={t.done ? 'Segna come da fare' : 'Segna come fatto'}
                />
                <span className={styles.todoText}>{t.text}</span>
              </li>
            ))}

            {/* Riga aggiunta nuova task */}
            <li className={styles.todoAddRow}>
              {addingTodo ? (
                <input
                  className={styles.todoInput}
                  autoFocus
                  value={newTodoText}
                  onChange={e => setNewTodoText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmNewTodo()}
                  onBlur={confirmNewTodo}
                  placeholder="Nuova task…"
                />
              ) : (
                <button className={styles.todoAddBtn} onClick={() => setAddingTodo(true)}>
                  · · ·
                </button>
              )}
            </li>
          </ul>
        </section>

        {/* ── CHALLENGE YOURSELF ─────────────────────────── */}
        <section
          className={`${styles.cardSand} ${future ? styles.disabled : ''}`}
          aria-disabled={future}
        >
          <h2 className={styles.blockTitle}>Challenge Yourself</h2>

          <div className={styles.challengeRows}>

            <div className={styles.challengeRow}>
              <label className={styles.challengeLabel}>👟 Passi</label>
              <input
                className={styles.challengeInput}
                type="number" min="0" step="100"
                value={challenge.passi}
                onChange={setField('passi')}
                disabled={future}
                placeholder="0"
              />
            </div>

            <div className={styles.challengeRow}>
              <label className={styles.challengeLabel}>💧 Acqua</label>
              <div className={styles.challengeInputUnit}>
                <input
                  className={styles.challengeInput}
                  type="number" min="0" step="0.1"
                  value={challenge.acqua}
                  onChange={setField('acqua')}
                  disabled={future}
                  placeholder="0.0"
                />
                <span className={styles.unit}>litri</span>
              </div>
            </div>

            <div className={styles.challengeRow}>
              <label className={styles.challengeLabel}>📱 Social media</label>
              <div className={styles.challengeInputUnit}>
                <input
                  className={styles.challengeInput}
                  type="number" min="0" step="1"
                  value={challenge.social}
                  onChange={setField('social')}
                  disabled={future}
                  placeholder="0"
                />
                <span className={styles.unit}>min</span>
              </div>
            </div>

            <div className={styles.challengeRow}>
              <label className={styles.challengeLabel}>🚴 Cyclette</label>
              <div className={styles.challengeInputUnit}>
                <input
                  className={styles.challengeInput}
                  type="number" min="0" step="5"
                  value={challenge.cyclette}
                  onChange={setField('cyclette')}
                  disabled={future}
                  placeholder="0"
                />
                <span className={styles.unit}>min</span>
              </div>
            </div>

            <div className={styles.challengeRow}>
              <label className={styles.challengeLabel}>🧘 Yoga</label>
              <div className={styles.challengeInputUnit}>
                <input
                  className={styles.challengeInput}
                  type="number" min="0" step="5"
                  value={challenge.yoga}
                  onChange={setField('yoga')}
                  disabled={future}
                  placeholder="0"
                />
                <span className={styles.unit}>min</span>
              </div>
            </div>

            {/* Checkbox Zero zuccheri */}
            <label className={styles.challengeCheckRow}>
              <div
                className={`${styles.bigCheck} ${challenge.zeroZuccheri ? styles.bigChecked : ''}`}
                onClick={() => !future && setChallenge(p => ({ ...p, zeroZuccheri: !p.zeroZuccheri }))}
              />
              <span>Zero zuccheri 🍬</span>
            </label>

          </div>
        </section>

        {/* ── QUADRANTI 2x2 ──────────────────────────────── */}
        <div className={styles.twoByTwo}>

          {/* ── Sonno (salvia, riga 1 sinistra) ── */}
          <section
            className={`${styles.quadSage} ${future ? styles.disabled : ''}`}
            aria-disabled={future}
          >
            <h3 className={styles.quadTitle}>Sonno</h3>

            <div className={styles.sonnoRow}>
              <span className={styles.sonnoLabel}>Dalle</span>
              <input
                className={styles.timeInput}
                type="time"
                value={sonno.dalle}
                onChange={setSonnoField('dalle')}
                disabled={future}
              />
            </div>
            <div className={styles.sonnoRow}>
              <span className={styles.sonnoLabel}>Alle</span>
              <input
                className={styles.timeInput}
                type="time"
                value={sonno.alle}
                onChange={setSonnoField('alle')}
                disabled={future}
              />
            </div>

            <p className={styles.sonnoTotal}>
              Totale <strong>{sleepTotal}</strong> ore
            </p>
            <div className={styles.sonnoRow}>
              <span className={styles.sonnoLabel}>Qualità</span>
              <div className={styles.challengeInputUnit}>
                <input
                  className={`${styles.challengeInput} ${styles.smallInput}`}
                  type="number" min="1" max="10"
                  value={sonno.qualita}
                  onChange={setSonnoField('qualita')}
                  disabled={future}
                  placeholder="—"
                />
                <span className={styles.unit}>/10</span>
              </div>
            </div>
          </section>

          {/* ── Ciclo (bianco, riga 1 destra) — NON disabilitato per date future ── */}
          <section className={styles.quadWhite}>
            <h3 className={styles.quadTitle}>Ciclo</h3>

            {/* TODO: Firebase — caricare fase ciclo reale dell'utente */}
            <div className={styles.donutWrapper}>
              <CycleDonut />
            </div>

            <p className={styles.cyclePhase}>
              {CYCLE_PHASES[CURRENT_PHASE_IDX].name}
            </p>
            <p className={styles.cycleDay}>
              Giorno {CURRENT_PHASE_DAY}
            </p>
            <p className={styles.cycleDesc}>
              Energia in aumento, ottimo momento per nuovi inizi.
            </p>
          </section>

          {/* ── Umore (bianco, riga 2 sinistra) ── */}
          <section
            className={`${styles.quadWhite} ${future ? styles.disabled : ''}`}
            aria-disabled={future}
          >
            <h3 className={styles.quadTitle}>Umore</h3>

            <div className={styles.emojiGrid}>
              {MOOD_EMOJI.map((em, i) => (
                <button
                  key={i}
                  className={`${styles.emojiBtn} ${emojiSel.includes(i) ? styles.emojiSel : ''}`}
                  onClick={() => !future && toggleEmoji(i)}
                  aria-label={`Seleziona umore ${em}`}
                  aria-pressed={emojiSel.includes(i)}
                  disabled={future}
                >
                  {em}
                </button>
              ))}
            </div>

            <div className={`${styles.sonnoRow} ${styles.umoreVotoRow}`}>
              <span className={styles.sonnoLabel}>Voto</span>
              <div className={styles.challengeInputUnit}>
                <input
                  className={`${styles.challengeInput} ${styles.smallInput}`}
                  type="number" min="1" max="10"
                  value={umoreVoto}
                  onChange={e => setUmoreVoto(e.target.value)}
                  disabled={future}
                  placeholder="—"
                />
                <span className={styles.unit}>/10</span>
              </div>
            </div>
          </section>

          {/* ── Small Habits (salvia, riga 2 destra) ── */}
          <section
            className={`${styles.quadSage} ${future ? styles.disabled : ''}`}
            aria-disabled={future}
          >
            <h3 className={styles.quadTitle}>Small Habits</h3>

            <ul className={styles.habitList}>
              {/* TODO: Firebase — caricare habit personalizzate dell'utente */}
              {habits.map(h => (
                <li key={h.id} className={styles.habitItem}>
                  <div
                    className={`${styles.habitCheck} ${h.done ? styles.habitChecked : ''}`}
                    onClick={() => !future && toggleHabit(h.id)}
                  />
                  <span className={h.done ? styles.habitDone : ''}>{h.label}</span>
                </li>
              ))}
            </ul>
          </section>

        </div>
        {/* fine twoByTwo */}

        {/* ── NOTE ─────────────────────────────────────────── */}
        <section className={styles.cardSand}>
          <h2 className={styles.blockTitle}>Note</h2>

          {/* TODO: Firebase — salvare note per la data corrente */}
          <textarea
            className={styles.noteArea}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Scrivi qualcosa..."
            rows={8}
          />
        </section>

      </main>
    </div>
  )
}
