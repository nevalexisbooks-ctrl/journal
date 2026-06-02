// ─── DetailScreen — "Nel dettaglio" ─────────────────────────────────────────
// Persistenza su Firestore: collection `giorni`, doc ID = YYYY-MM-DD.
// Caricamento automatico al cambio data, salvataggio automatico debounced
// (600ms) ad ogni modifica.
import React, { useState, useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { toDateKey } from '../utils/calcWidgets.js'
import styles from './DetailScreen.module.css'

/** Sposta una data di `delta` giorni */
function shiftDay(date, delta) {
  const d = new Date(date)
  d.setDate(d.getDate() + delta)
  return d
}

/** true se `date` è strettamente futura rispetto a oggi */
function isFutureDay(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d     = new Date(date); d.setHours(0, 0, 0, 0)
  return d > today
}

/** "Lun 2 giu 2026" */
function formatDateShort(date) {
  return date.toLocaleDateString('it-IT', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ════════════════════════════════════════════════════════════════
//  HELPERS — sonno
// ════════════════════════════════════════════════════════════════

function calcSleepTotal(dalle, alle) {
  if (!dalle || !alle) return '—'
  const [h1, m1] = dalle.split(':').map(Number)
  const [h2, m2] = alle.split(':').map(Number)
  let startMin = h1 * 60 + m1
  let endMin   = h2 * 60 + m2
  if (endMin <= startMin) endMin += 1440
  const diff = endMin - startMin
  const hh   = Math.floor(diff / 60)
  const mm   = diff % 60
  return mm === 0 ? `${hh}` : `${hh}:${String(mm).padStart(2, '0')}`
}

// ════════════════════════════════════════════════════════════════
//  SVG DONUT — ciclo mestruale
// ════════════════════════════════════════════════════════════════

function polarToXY(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function donutSlice(cx, cy, outerR, innerR, startDeg, endDeg) {
  const o1  = polarToXY(cx, cy, outerR, startDeg)
  const o2  = polarToXY(cx, cy, outerR, endDeg)
  const i1  = polarToXY(cx, cy, innerR, startDeg)
  const i2  = polarToXY(cx, cy, innerR, endDeg)
  const lg  = endDeg - startDeg > 180 ? 1 : 0
  const f   = (n) => n.toFixed(2)
  return (
    `M ${f(o1.x)} ${f(o1.y)} ` +
    `A ${outerR} ${outerR} 0 ${lg} 1 ${f(o2.x)} ${f(o2.y)} ` +
    `L ${f(i2.x)} ${f(i2.y)} ` +
    `A ${innerR} ${innerR} 0 ${lg} 0 ${f(i1.x)} ${f(i1.y)} Z`
  )
}

// Fasi ciclo standard 28 giorni
const CYCLE_PHASES = [
  { name: 'Mestruale',   days: 5,  color: '#E88080', desc: 'Periodo di riposo e introspezione.' },
  { name: 'Follicolare', days: 8,  color: '#8A9E85', desc: 'Energia in aumento, ottimo momento per nuovi inizi.' },
  { name: 'Ovulatoria',  days: 3,  color: '#D4C070', desc: 'Picco di energia e socialità.' },
  { name: 'Luteale',     days: 12, color: '#D9C9A8', desc: 'Tempo di completare e riflettere.' },
]
const CYCLE_TOTAL   = 28
const CURRENT_PHASE = 1  // placeholder: Follicolare
const CURRENT_DAY   = 5  // placeholder: giorno 5

function CycleDonut() {
  const cx = 50, cy = 50, outerR = 38, innerR = 24
  let angle = 0
  return (
    <svg viewBox="0 0 100 100" className={styles.donutSvg} aria-hidden="true">
      {CYCLE_PHASES.map((ph, i) => {
        const span  = (ph.days / CYCLE_TOTAL) * 360
        const start = angle
        angle += span
        return (
          <path
            key={ph.name}
            d={donutSlice(cx, cy, i === CURRENT_PHASE ? outerR + 4 : outerR, innerR, start, angle)}
            fill={ph.color}
            opacity={i === CURRENT_PHASE ? 1 : 0.5}
          />
        )
      })}
    </svg>
  )
}

// ════════════════════════════════════════════════════════════════
//  VALORI DEFAULT (giornata nuova / nessun documento Firestore)
// ════════════════════════════════════════════════════════════════

const DEFAULT_CHALLENGE = { passi: '', acqua: '', social: '', cyclette: '', yoga: '', zeroZuccheri: false }
const DEFAULT_SONNO     = { dalle: '', alle: '', qualita: '' }
const DEFAULT_HABITS    = [
  { id: 1, text: 'Crochet',    done: false },
  { id: 2, text: 'Dry brush',  done: false },
  { id: 3, text: 'Leggere',    done: false },
  { id: 4, text: 'Stretching', done: false },
  { id: 5, text: 'Journaling', done: false },
]
const MOOD_EMOJI = ['🥰', '😌', '😑', '🫩', '🤒', '🥺', '🫨', '😡']

// ════════════════════════════════════════════════════════════════
//  COMPONENTE
// ════════════════════════════════════════════════════════════════

export default function DetailScreen({ onBack }) {
  // ── Data visualizzata ────────────────────────────────────────
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const future = isFutureDay(currentDate)

  // ── Stato locale della giornata ──────────────────────────────
  const [todos,      setTodos]      = useState([])
  const [challenge,  setChallenge]  = useState(DEFAULT_CHALLENGE)
  const [sonno,      setSonno]      = useState(DEFAULT_SONNO)
  const [emojiSel,   setEmojiSel]   = useState([])
  const [umoreVoto,  setUmoreVoto]  = useState('')
  const [habits,     setHabits]     = useState(DEFAULT_HABITS)
  const [note,       setNote]       = useState('')

  // ── UI: aggiunta to-do inline ────────────────────────────────
  const [addingTodo,  setAddingTodo]  = useState(false)
  const [newTodoText, setNewTodoText] = useState('')

  // ── UI: modifica/elimina to-do ───────────────────────────────
  const [editingId,   setEditingId]   = useState(null)   // id task in modifica
  const [editingText, setEditingText] = useState('')      // testo nell'input
  const [selectedId,  setSelectedId]  = useState(null)   // tap su mobile

  // ── Refs per controllo caricamento / salvataggio ─────────────
  // dataReady: false durante il caricamento → blocca l'auto-save
  const dataReadyRef    = useRef(false)
  const saveTimerRef    = useRef(null)
  // Tiene traccia della data per cui i dati sono caricati
  const loadedKeyRef    = useRef('')

  // ════════════════════════════════════════════════════════════
  //  CARICAMENTO da Firestore al cambio data
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    dataReadyRef.current = false
    clearTimeout(saveTimerRef.current)

    let cancelled = false
    const key = toDateKey(currentDate)

    async function loadDay() {
      try {
        const snap = await getDoc(doc(db, 'giorni', key))
        if (cancelled) return

        if (snap.exists()) {
          const d = snap.data()
          setTodos(d.todos      ?? [])
          setChallenge(d.challenge  ?? DEFAULT_CHALLENGE)
          setSonno(d.sonno       ?? DEFAULT_SONNO)
          setEmojiSel(d.umore?.faccine ?? [])
          setUmoreVoto(d.umore?.voto    ?? '')
          // Mantieni la lista habit di default ma aggiorna i `done`
          setHabits(DEFAULT_HABITS.map(h => {
            const saved = (d.habits ?? []).find(s => s.id === h.id)
            return saved ? { ...h, done: saved.done ?? false, text: saved.text ?? h.text } : h
          }))
          setNote(d.note ?? '')
        } else {
          // Giornata nuova — tutto vuoto
          setTodos([])
          setChallenge(DEFAULT_CHALLENGE)
          setSonno(DEFAULT_SONNO)
          setEmojiSel([])
          setUmoreVoto('')
          setHabits(DEFAULT_HABITS)
          setNote('')
        }
      } catch (err) {
        console.error('Errore caricamento giornata:', err)
      } finally {
        if (!cancelled) {
          loadedKeyRef.current  = key
          dataReadyRef.current  = true
        }
      }
    }

    loadDay()
    return () => { cancelled = true }
  }, [currentDate])

  // ════════════════════════════════════════════════════════════
  //  AUTO-SAVE su Firestore (debounced 600ms)
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    // Non salvare durante/prima del caricamento
    if (!dataReadyRef.current) return

    const key = toDateKey(currentDate)

    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      // Garanzia extra: la data corrente coincide con quella caricata
      if (key !== loadedKeyRef.current) return

      const payload = {
        todos,
        challenge,
        sonno,
        umore:  { faccine: emojiSel, voto: umoreVoto },
        habits,
        note,
      }
      try {
        await setDoc(doc(db, 'giorni', key), payload, { merge: true })
      } catch (err) {
        console.error('Errore salvataggio:', err)
      }
    }, 600)

    return () => clearTimeout(saveTimerRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, challenge, sonno, emojiSel, umoreVoto, habits, note])

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
    if (text) {
      setTodos(prev => [...prev, { id: Date.now(), text, done: false }])
    }
    setNewTodoText('')
    setAddingTodo(false)
  }

  // Entra in modalità modifica per una task esistente
  const startEdit = (t) => {
    setEditingId(t.id)
    setEditingText(t.text)
    setSelectedId(null)
  }

  // Conferma modifica (Invio o blur)
  const confirmEdit = () => {
    if (!editingId) return
    const text = editingText.trim()
    if (text) {
      setTodos(prev => prev.map(t => t.id === editingId ? { ...t, text } : t))
    }
    setEditingId(null)
    setEditingText('')
  }

  // Elimina una task e salva su Firestore tramite l'auto-save
  const deleteTodo = (id) => {
    setTodos(prev => prev.filter(t => t.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  // ── Challenge ──
  const setField = (field) => (e) => {
    const val = field === 'zeroZuccheri' ? e.target.checked : e.target.value
    setChallenge(prev => ({ ...prev, [field]: val }))
  }

  // ── Sonno ──
  const setSonnoField = (field) => (e) =>
    setSonno(prev => ({ ...prev, [field]: e.target.value }))

  // ── Umore emoji ──
  const toggleEmoji = (i) =>
    setEmojiSel(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])

  // ── Habits ──
  const toggleHabit = (id) =>
    setHabits(prev => prev.map(h => h.id === id ? { ...h, done: !h.done } : h))

  const sleepTotal = calcSleepTotal(sonno.dalle, sonno.alle)

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

        <p className={styles.headerTitle}>Nel dettaglio...</p>

        {/* Navigazione giorno << data >> */}
        <div className={styles.dateNav}>
          <button className={styles.navArrow} onClick={goBack}    aria-label="Giorno precedente">‹‹</button>
          <span   className={styles.dateLabel}>{formatDateShort(currentDate)}</span>
          <button className={styles.navArrow} onClick={goForward} aria-label="Giorno successivo">››</button>
        </div>
      </header>

      {/* ══ SCROLL ══════════════════════════════════════════════ */}
      <main className={styles.main}>

        {/* ── TO DO (sempre attivo, anche per date future) ────── */}
        <section className={styles.cardWhite}>
          <h2 className={styles.blockTitle}>To do</h2>

          <ul className={styles.todoList}>
            {todos.map(t => (
              <li
                key={t.id}
                className={[
                  styles.todoItem,
                  t.done             ? styles.todoDone     : '',
                  selectedId === t.id ? styles.todoSelected : '',
                ].join(' ')}
                // Tap su mobile: seleziona/deseleziona per mostrare le azioni
                onClick={() => {
                  if (editingId === t.id) return
                  setSelectedId(prev => prev === t.id ? null : t.id)
                }}
              >
                {/* Checkbox */}
                <button
                  className={`${styles.todoCheck} ${t.done ? styles.todoChecked : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggleTodo(t.id) }}
                  aria-label={t.done ? 'Segna come da fare' : 'Segna come fatto'}
                />

                {/* Testo o input di modifica inline */}
                {editingId === t.id ? (
                  <input
                    className={styles.todoEditInput}
                    autoFocus
                    value={editingText}
                    onChange={e => setEditingText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  confirmEdit()
                      if (e.key === 'Escape') { setEditingId(null); setEditingText('') }
                    }}
                    onBlur={confirmEdit}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className={styles.todoText}>{t.text}</span>
                )}

                {/* Azioni: matita + X (hover desktop / tap mobile) */}
                {editingId !== t.id && (
                  <div className={`${styles.todoActions} ${selectedId === t.id ? styles.todoActionsVisible : ''}`}>
                    <button
                      className={styles.todoActionBtn}
                      onClick={(e) => { e.stopPropagation(); startEdit(t) }}
                      aria-label="Modifica task"
                      title="Modifica"
                    >✏️</button>
                    <button
                      className={`${styles.todoActionBtn} ${styles.deleteBtnTodo}`}
                      onClick={(e) => { e.stopPropagation(); deleteTodo(t.id) }}
                      aria-label="Elimina task"
                      title="Elimina"
                    >✕</button>
                  </div>
                )}
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

        {/* ── CHALLENGE YOURSELF ──────────────────────────────── */}
        <section className={`${styles.cardSand} ${future ? styles.disabled : ''}`}>
          <h2 className={styles.blockTitle}>Challenge Yourself</h2>

          <div className={styles.challengeRows}>
            {[
              { field: 'passi',    label: '👟 Passi',        unit: '',      step: '100',  placeholder: '0' },
              { field: 'acqua',    label: '💧 Acqua',        unit: 'litri', step: '0.1',  placeholder: '0.0' },
              { field: 'social',   label: '📱 Social media', unit: 'min',   step: '1',    placeholder: '0' },
              { field: 'cyclette', label: '🚴 Cyclette',     unit: 'min',   step: '5',    placeholder: '0' },
              { field: 'yoga',     label: '🧘 Yoga',         unit: 'min',   step: '5',    placeholder: '0' },
            ].map(({ field, label, unit, step, placeholder }) => (
              <div key={field} className={styles.challengeRow}>
                <label className={styles.challengeLabel}>{label}</label>
                <div className={styles.challengeInputUnit}>
                  <input
                    className={styles.challengeInput}
                    type="number" min="0" step={step}
                    value={challenge[field]}
                    onChange={setField(field)}
                    disabled={future}
                    placeholder={placeholder}
                  />
                  {unit && <span className={styles.unit}>{unit}</span>}
                </div>
              </div>
            ))}

            <label className={styles.challengeCheckRow}>
              <div
                className={`${styles.bigCheck} ${challenge.zeroZuccheri ? styles.bigChecked : ''}`}
                onClick={() => !future && setChallenge(p => ({ ...p, zeroZuccheri: !p.zeroZuccheri }))}
              />
              <span>Zero zuccheri 🍬</span>
            </label>
          </div>
        </section>

        {/* ── QUADRANTI 2×2 ──────────────────────────────────── */}
        <div className={styles.twoByTwo}>

          {/* Sonno — salvia, riga 1 sx */}
          <section className={`${styles.quadSage} ${future ? styles.disabled : ''}`}>
            <h3 className={styles.quadTitle}>Sonno</h3>

            {[
              { field: 'dalle', label: 'Dalle' },
              { field: 'alle',  label: 'Alle' },
            ].map(({ field, label }) => (
              <div key={field} className={styles.sonnoRow}>
                <span className={styles.sonnoLabel}>{label}</span>
                <input
                  className={styles.timeInput}
                  type="time"
                  value={sonno[field]}
                  onChange={setSonnoField(field)}
                  disabled={future}
                />
              </div>
            ))}

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

          {/* Ciclo — bianco, riga 1 dx (mai disabilitato) */}
          <section className={styles.quadWhite}>
            <h3 className={styles.quadTitle}>Ciclo</h3>
            {/* TODO: Firebase — caricare fase ciclo reale dell'utente */}
            <div className={styles.donutWrapper}>
              <CycleDonut />
            </div>
            <p className={styles.cyclePhase}>{CYCLE_PHASES[CURRENT_PHASE].name}</p>
            <p className={styles.cycleDay}>Giorno {CURRENT_DAY}</p>
            <p className={styles.cycleDesc}>{CYCLE_PHASES[CURRENT_PHASE].desc}</p>
          </section>

          {/* Umore — bianco, riga 2 sx */}
          <section className={`${styles.quadWhite} ${future ? styles.disabled : ''}`}>
            <h3 className={styles.quadTitle}>Umore</h3>

            <div className={styles.emojiGrid}>
              {MOOD_EMOJI.map((em, i) => (
                <button
                  key={i}
                  className={`${styles.emojiBtn} ${emojiSel.includes(i) ? styles.emojiSel : ''}`}
                  onClick={() => !future && toggleEmoji(i)}
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

          {/* Small Habits — salvia, riga 2 dx */}
          <section className={`${styles.quadSage} ${future ? styles.disabled : ''}`}>
            <h3 className={styles.quadTitle}>Small Habits</h3>
            {/* TODO: Firebase — permettere personalizzazione lista habit */}
            <ul className={styles.habitList}>
              {habits.map(h => (
                <li key={h.id} className={styles.habitItem}>
                  <div
                    className={`${styles.habitCheck} ${h.done ? styles.habitChecked : ''}`}
                    onClick={() => !future && toggleHabit(h.id)}
                  />
                  <span className={h.done ? styles.habitDone : ''}>{h.text}</span>
                </li>
              ))}
            </ul>
          </section>

        </div>

        {/* ── NOTE (sempre attivo) ────────────────────────────── */}
        <section className={styles.cardSand}>
          <h2 className={styles.blockTitle}>Note</h2>
          {/* TODO: Firebase — già gestito dall'auto-save sopra */}
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
