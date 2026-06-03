// ─── DetailScreen — "Nel dettaglio" ─────────────────────────────────────────
// Persistenza su Firestore: collection `giorni`, doc ID = YYYY-MM-DD.
// Caricamento automatico al cambio data, salvataggio automatico debounced
// (600ms) ad ogni modifica.
import React, { useState, useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { toDateKey, calcCyclePhase } from '../utils/calcWidgets.js'
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

// ── Fasi ciclo (colori e proporzioni per il donut) ────────────────────────
const CYCLE_PHASES = [
  { name: 'Mestruale',   days: 5,  color: '#E88080' },
  { name: 'Follicolare', days: 8,  color: '#8A9E85' },
  { name: 'Ovulatoria',  days: 3,  color: '#D4C070' },
  { name: 'Luteale',     days: 12, color: '#D9C9A8' },
]
const CYCLE_TOTAL = 28

// ── Testi specifici per ogni giorno del ciclo (1-28) ─────────────────────
// Per giorni > 28 (cicli lunghi) si usa il testo del giorno 28 tramite getCycleText()
const CYCLE_DAY_TEXTS = {
  1:  'Il corpo sta rinnovandosi. Concediti riposo senza sensi di colpa.',
  2:  'Il flusso è probabilmente al massimo. Tieni caldo e idratati bene.',
  3:  "I crampi potrebbero allentarsi un po'. L'umore è ancora altalenante, è ormonale.",
  4:  "L'energia torna lentamente. Non forzare, lasciala arrivare.",
  5:  'Quasi fuori dalla fase mestruale. Potresti sentirti già più leggera.',
  6:  'Gli estrogeni iniziano a salire. Buon momento per pianificare e fare chiarezza.',
  7:  'L\'energia cresce. Il corpo risponde bene al movimento oggi.',
  8:  'Mente lucida e motivazione alta. Approfitta di questa fase produttiva.',
  9:  'Ti senti più socievole del solito? Gli ormoni favoriscono la connessione con gli altri.',
  10: 'Energia stabile e umore positivo. Buon momento per affrontare cose rimaste in sospeso.',
  11: 'Il picco di estrogeni si avvicina. Potresti sentirti più creativa e ispirata.',
  12: 'La pelle tende a essere al meglio, l\'umore alto. Goditi questa fase.',
  13: 'Il corpo si prepara per l\'ovulazione. Energia al top.',
  14: 'Picco assoluto di energia e fiducia. Probabilmente la tua giornata migliore del mese.',
  15: 'Sei nel cuore della fase ovulatoria. Carica e pronta a tutto.',
  16: "L'ovulazione si conclude. Inizia a introdurre qualche momento di calma.",
  17: 'Inizia la fase luteale. Potresti sentire i primi accenni di gonfiore o stanchezza, è normale.',
  18: "L'energia cala gradualmente. Privilegia attività dolci come yoga o passeggiate.",
  19: 'La mente è più riflessiva oggi. Ottimo momento per scrivere e fare ordine.',
  20: 'Potresti avere qualche craving in più. Il corpo cerca energie extra, non giudicarti.',
  21: "L'umore può essere variabile. Se ti senti irritabile è ormonale, non è colpa tua.",
  22: 'Stai entrando nella settimana pre-mestruale. Dai priorità al riposo.',
  23: 'I sintomi PMS possono farsi sentire. Idratazione e movimento leggero aiutano.',
  24: 'Potresti sentirti più sensibile emotivamente. Concediti gentilezza oggi.',
  25: 'Il gonfiore che senti è temporaneo. Il corpo trattiene più liquidi in questi giorni.',
  26: "L'energia è probabilmente bassa. Va benissimo fare meno e rallentare.",
  27: 'Il corpo sta lavorando tanto. Rispettalo e riposati.',
  28: 'Ultimo giorno del ciclo. Prenditi cura di te stasera.',
}

/**
 * Restituisce il testo per il giorno specificato del ciclo.
 * Clamp a 1-28: per cicli più lunghi usa il testo del giorno 28.
 */
function getCycleText(dayInCycle) {
  const d = Math.max(1, Math.min(28, dayInCycle || 1))
  return CYCLE_DAY_TEXTS[d]
}

function CycleDonut({ activeIdx = 1 }) {
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
            d={donutSlice(cx, cy, i === activeIdx ? outerR + 4 : outerR, innerR, start, angle)}
            fill={ph.color}
            opacity={i === activeIdx ? 1 : 0.5}
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

// Config habit di default (usate se settings/habits non esiste ancora)
const DEFAULT_HABITS_CFG = [
  { id: 1, text: 'Crochet',    startDate: '', endDate: null },
  { id: 2, text: 'Dry brush',  startDate: '', endDate: null },
  { id: 3, text: 'Leggere',    startDate: '', endDate: null },
  { id: 4, text: 'Stretching', startDate: '', endDate: null },
  { id: 5, text: 'Journaling', startDate: '', endDate: null },
]

/** Filtra habits per data: startDate <= date < endDate (se presente) */
function filterHabits(cfg, date) {
  const key = toDateKey(date)
  return cfg.filter(h => {
    if (h.startDate && key < h.startDate) return false
    if (h.endDate   && key >= h.endDate)  return false
    return true
  })
}

const MOOD_EMOJI = ['🥰', '😌', '😑', '🫩', '🤒', '🥺', '🫨', '😡']

// ════════════════════════════════════════════════════════════════
//  COMPONENTE
// ════════════════════════════════════════════════════════════════

export default function DetailScreen({ onBack, initialDate }) {
  // ── Data visualizzata (può partire da una data specifica) ────
  const [currentDate, setCurrentDate] = useState(() => initialDate ?? new Date())
  const future = isFutureDay(currentDate)

  // ── Stato locale della giornata ──────────────────────────────
  const [todos,      setTodos]      = useState([])
  const [challenge,  setChallenge]  = useState(DEFAULT_CHALLENGE)
  const [sonno,      setSonno]      = useState(DEFAULT_SONNO)
  const [emojiSel,   setEmojiSel]   = useState([])
  const [umoreVoto,  setUmoreVoto]  = useState('')
  const [habits,     setHabits]     = useState([])
  const [note,       setNote]       = useState('')

  // ── Stato ciclo (caricato da settings/ciclo) ─────────────────
  const [cycleInfo, setCycleInfo] = useState({ phaseIdx: 1, dayInPhase: 1 })

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
        // Carica in parallelo: giornata + config habits + config ciclo
        const [daySnap, habitsSnap, cicloSnap] = await Promise.all([
          getDoc(doc(db, 'giorni',   key)),
          getDoc(doc(db, 'settings', 'habits')),
          getDoc(doc(db, 'settings', 'ciclo')),
        ])
        if (cancelled) return

        // ── Habit: sorgente di verità da settings ──────────────
        const habitsCfg = habitsSnap.exists()
          ? (habitsSnap.data().habits ?? DEFAULT_HABITS_CFG)
          : DEFAULT_HABITS_CFG
        const filteredCfg = filterHabits(habitsCfg, currentDate)

        // ── Ciclo: calcola fase per la data visualizzata ────────
        if (cicloSnap.exists()) {
          const c  = cicloSnap.data()
          const ph = calcCyclePhase(c.dataInizio, c.durataCiclo, c.durataflusso, currentDate)
          setCycleInfo(ph)
        } else {
          setCycleInfo({ phaseIdx: 1, dayInPhase: 1 })
        }

        if (daySnap.exists()) {
          const d = daySnap.data()
          setTodos(d.todos         ?? [])
          setChallenge(d.challenge ?? DEFAULT_CHALLENGE)
          setSonno(d.sonno         ?? DEFAULT_SONNO)
          setEmojiSel(d.umore?.faccine ?? [])
          setUmoreVoto(d.umore?.voto   ?? '')
          setNote(d.note ?? '')

          // Merge config habits + done state dal giorno
          const doneMap = (d.habits ?? []).reduce((acc, h) => {
            acc[h.id] = h.done ?? false; return acc
          }, {})
          setHabits(filteredCfg.map(h => ({ ...h, done: doneMap[h.id] ?? false })))
        } else {
          setTodos([])
          setChallenge(DEFAULT_CHALLENGE)
          setSonno(DEFAULT_SONNO)
          setEmojiSel([])
          setUmoreVoto('')
          setNote('')
          setHabits(filteredCfg.map(h => ({ ...h, done: false })))
        }
      } catch (err) {
        console.error('Errore caricamento giornata:', err)
      } finally {
        if (!cancelled) {
          loadedKeyRef.current = key
          dataReadyRef.current = true
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
              {
                field: 'passi', unit: '', step: '100', placeholder: '0', label: 'Passi',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#8A9E85" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="3" y1="6"  x2="15" y2="6"  />
                    <line x1="3" y1="10" x2="12" y2="10" />
                    <line x1="3" y1="14" x2="9"  y2="14" />
                  </svg>
                ),
              },
              {
                field: 'acqua', unit: 'litri', step: '0.1', placeholder: '0.0', label: 'Acqua',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#8A9E85" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="12" r="4" />
                    <polygon points="9,4 7,8 11,8" />
                  </svg>
                ),
              },
              {
                field: 'social', unit: 'min', step: '1', placeholder: '0', label: 'Social media',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#8A9E85" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="12" height="12" rx="2" />
                    <line x1="6" y1="9" x2="12" y2="9" />
                  </svg>
                ),
              },
              {
                field: 'cyclette', unit: 'min', step: '5', placeholder: '0', label: 'Cyclette',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#8A9E85" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="4" cy="13" r="3" />
                    <circle cx="14" cy="13" r="3" />
                    <line x1="4" y1="13" x2="14" y2="13" />
                  </svg>
                ),
              },
              {
                field: 'yoga', unit: 'min', step: '5', placeholder: '0', label: 'Yoga',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#8A9E85" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="9" cy="4" r="1.5" />
                    <line x1="9" y1="5.5" x2="9" y2="12" />
                    <line x1="9" y1="9" x2="5" y2="13" />
                    <line x1="9" y1="9" x2="13" y2="13" />
                  </svg>
                ),
              },
            ].map(({ field, label, unit, step, placeholder, icon }) => (
              <div key={field} className={styles.challengeRow}>
                <label className={styles.challengeLabel}>
                  <span className={styles.challengeIcon}>{icon}</span>
                  {label}
                </label>
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

            {/* Zero zuccheri — toggle Sì/No */}
            <div className={styles.challengeRow}>
              <label className={styles.challengeLabel}>
                <span className={styles.challengeIcon}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#8A9E85" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="12" height="12" rx="2" />
                    <line x1="6" y1="6" x2="12" y2="12" />
                    <line x1="12" y1="6" x2="6" y2="12" />
                  </svg>
                </span>
                Zero zuccheri
              </label>
              <div className={styles.toggleGroup}>
                <button
                  type="button"
                  className={`${styles.toggleBtn} ${challenge.zeroZuccheri === true ? styles.toggleBtnOn : styles.toggleBtnNeutral}`}
                  onClick={() => !future && setChallenge(p => ({ ...p, zeroZuccheri: true }))}
                  disabled={future}
                >Sì</button>
                <button
                  type="button"
                  className={`${styles.toggleBtn} ${challenge.zeroZuccheri === false ? styles.toggleBtnOff : styles.toggleBtnNeutral}`}
                  onClick={() => !future && setChallenge(p => ({ ...p, zeroZuccheri: false }))}
                  disabled={future}
                >No</button>
              </div>
            </div>
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
            {/* Fase calcolata da settings/ciclo tramite calcCyclePhase() */}
            <div className={styles.donutWrapper}>
              <CycleDonut activeIdx={cycleInfo.phaseIdx} />
            </div>
            {/* Mostra il giorno ASSOLUTO del ciclo (es. "Giorno 22"), non il giorno nella fase */}
            <p className={styles.cyclePhase}>{CYCLE_PHASES[cycleInfo.phaseIdx].name}</p>
            <p className={styles.cycleDay}>Giorno {cycleInfo.dayInCycle}</p>
            <p className={styles.cycleDesc}>{getCycleText(cycleInfo.dayInCycle)}</p>
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
