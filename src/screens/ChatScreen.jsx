// ─── ChatScreen — Chat con l'Assistente AI ───────────────────────────────────
// Prima di ogni invio raccoglie da Firestore:
//   - Oggi e ieri da giorni/{YYYY-MM-DD}
//   - Goals e note settimanali da settimane/{YYYY-WNN}  (NON il menù)
//   - settings/ciclo per fase mestruale corrente
//   - Profilo utente da Firestore settings/profilo
//   - System prompt da localStorage 'ai_system_prompt'
// Cronologia chat salvata su Firestore collection 'chat' doc 'storia'.
// La chiamata API passa per la Firebase Function claudeProxy (nessun CORS).
import React, { useState, useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  toDateKey, toWeekKey, getMonday, getWeekDays, calcDayScore, calcCyclePhase,
} from '../utils/calcWidgets.js'
import styles from './ChatScreen.module.css'

// ── Endpoint Firebase Function proxy ──────────────────────────────────────────
const PROXY_URL = 'https://us-central1-journal-4782d.cloudfunctions.net/claudeProxy'
const CLAUDE_MODEL = 'claude-haiku-3-5'

// ── System prompt di default ───────────────────────────────────────────────────
const DEFAULT_SYSTEM =
  'Sei un assistente empatico e motivante. Hai accesso ai dati del journal degli ultimi giorni. ' +
  'Usa queste informazioni per rispondere in modo personalizzato, riconoscere pattern e offrire supporto. ' +
  'Rispondi sempre in italiano.'

const WELCOME_MSG = 'Ciao! Sono qui per aiutarti a riflettere e crescere. Cosa hai in mente oggi? 🌱'

// ════════════════════════════════════════════════════════════════
//  PERSISTENZA FIRESTORE
// ════════════════════════════════════════════════════════════════

async function loadHistoryFromFirestore() {
  try {
    const snap = await getDoc(doc(db, 'chat', 'storia'))
    if (snap.exists()) {
      const msgs = snap.data().messages ?? []
      if (msgs.length > 0) return msgs
    }
  } catch (err) {
    console.warn('Errore caricamento chat:', err)
  }
  return [{ role: 'assistant', content: WELCOME_MSG }]
}

async function saveHistoryToFirestore(messages) {
  try {
    await setDoc(doc(db, 'chat', 'storia'), {
      messages: messages.map(m => ({
        role:      m.role,
        content:   m.content,
        timestamp: m.timestamp ?? Date.now(),
      })),
      updatedAt: Date.now(),
    })
  } catch (err) {
    console.warn('Errore salvataggio chat:', err)
  }
}

// ════════════════════════════════════════════════════════════════
//  RACCOLTA CONTESTO DA FIRESTORE + localStorage
// ════════════════════════════════════════════════════════════════

async function buildSystemPrompt() {
  const today    = new Date()
  const todayKey = toDateKey(today)

  // Oggi e ieri (indice 0 = oggi, indice 1 = ieri)
  const last4   = Array.from({ length: 2 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    return d
  })
  const dayKeys = last4.map(d => toDateKey(d))
  const weekKey = toWeekKey(today)

  // Carica tutto in parallelo da Firestore
  const [daySnaps, weekSnap, cicloSnap, profiloSnap, aiPromptSnap] = await Promise.all([
    Promise.all(dayKeys.map(k => getDoc(doc(db, 'giorni', k)))),
    getDoc(doc(db, 'settimane', weekKey)),
    getDoc(doc(db, 'settings', 'ciclo')),
    getDoc(doc(db, 'settings', 'profilo')),
    getDoc(doc(db, 'settings', 'aiPrompt')),
  ])

  // ── Helpers ───────────────────────────────────────────────────
  const ni = 'non inserito'
  const v  = (val) => (val != null && val !== '' ? String(val) : ni)
  const vNum = (val, unit = '') =>
    (val != null && val !== '' && Number(val) !== 0)
      ? `${val}${unit}`
      : ni
  const vBool = (val) => (val == null ? ni : val ? 'Sì' : 'No')

  // ── Calcola ore di sonno da "HH:MM"–"HH:MM" ──────────────────
  const calcOre = (dalle, alle) => {
    if (!dalle || !alle) return ni
    const [dh, dm] = dalle.split(':').map(Number)
    const [ah, am] = alle.split(':').map(Number)
    let mins = (ah * 60 + am) - (dh * 60 + dm)
    if (mins < 0) mins += 24 * 60
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}min (${dalle}–${alle})` : `${h}h (${dalle}–${alle})`
  }

  // ── Fase ciclo per un giorno specifico ───────────────────────
  const PHASE_NAMES = ['Mestruale', 'Follicolare', 'Ovulatoria', 'Luteale']
  const getFaseFor = (dateObj) => {
    if (!cicloSnap.exists()) return ni
    const c = cicloSnap.data()
    if (!c.dataInizio) return ni
    const ph = calcCyclePhase(c.dataInizio, c.durataCiclo, c.durataflusso, dateObj)
    return `${PHASE_NAMES[ph.phaseIdx]}, giorno ${ph.dayInCycle} del ciclo`
  }

  // ── Blocco per ogni giorno ────────────────────────────────────
  const dayBlocks = daySnaps.map((snap, i) => {
    const dateObj   = last4[i]
    const dateKey   = dayKeys[i]
    const isToday   = dateKey === todayKey
    const dateLabel = dateObj.toLocaleDateString('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    // Capitalizza prima lettera
    const header = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)

    const lines = [`--- ${header}${isToday ? ' (OGGI)' : ''} ---`]

    if (!snap.exists()) {
      // Giorno senza documento: mostra tutti i campi come "non inserito"
      lines.push(
        `Passi: ${ni}`,
        `Acqua: ${ni}`,
        `Social media: ${ni} minuti`,
        `Cyclette: ${ni} minuti`,
        `Yoga: ${ni} minuti`,
        `Zero zuccheri: ${ni}`,
        `Ore di sonno: ${ni}`,
        `Qualità sonno: ${ni}/10`,
        `Umore (faccine): ${ni}`,
        `Voto umore: ${ni}/10`,
        `Task del giorno: nessuna task`,
        `Small habits: nessuna habit`,
        `Note: nessuna nota`,
        `Voto giornaliero: non ancora calcolabile /10`,
        `Fase ciclo: ${getFaseFor(dateObj)}`,
      )
      return lines.join('\n')
    }

    const d  = snap.data()
    const ch = d.challenge ?? {}
    const sn = d.sonno     ?? {}
    const um = d.umore     ?? {}

    // Task
    const todos = d.todos ?? []
    let taskStr
    if (todos.length === 0) {
      taskStr = 'nessuna task'
    } else {
      taskStr = '\n' + todos.map(t => `  ${t.done ? '✓' : '○'} ${t.text}`).join('\n')
    }

    // Small habits
    const habits = d.habits ?? []
    let habitsStr
    if (habits.length === 0) {
      habitsStr = 'nessuna habit'
    } else {
      habitsStr = '\n' + habits.map(h => `  ${h.done ? '✓' : '○'} ${h.text}`).join('\n')
    }

    // Faccine umore
    const facceList = Array.isArray(um.faccine) && um.faccine.length > 0
      ? um.faccine.join(' ')
      : ni

    // Voto giornaliero
    const score = calcDayScore(d)
    const votoStr = score !== null
      ? `${score}/10${isToday ? ' (provvisorio)' : ''}`
      : 'non ancora calcolabile /10'

    lines.push(
      `Passi: ${vNum(ch.passi)}`,
      `Acqua: ${vNum(ch.acqua, 'L')}`,
      `Social media: ${vNum(ch.social, ' minuti')}`,
      `Cyclette: ${vNum(ch.cyclette, ' minuti')}`,
      `Yoga: ${vNum(ch.yoga, ' minuti')}`,
      `Zero zuccheri: ${vBool(ch.zeroZuccheri)}`,
      `Ore di sonno: ${calcOre(sn.dalle, sn.alle)}`,
      `Qualità sonno: ${sn.qualita != null ? sn.qualita + '/10' : ni}`,
      `Umore (faccine): ${facceList}`,
      `Voto umore: ${um.voto != null ? um.voto + '/10' : ni}`,
      `Task del giorno: ${taskStr}`,
      `Small habits: ${habitsStr}`,
      `Note: ${d.note?.trim() ? d.note.trim() : 'nessuna nota'}`,
      `Voto giornaliero: ${votoStr}`,
      `Fase ciclo: ${getFaseFor(dateObj)}`,
    )
    return lines.join('\n')
  })

  // ── Obiettivi settimanali ─────────────────────────────────────
  let goalsStr  = 'nessun obiettivo'
  let noteSettStr = 'nessuna nota'
  if (weekSnap.exists()) {
    const wData = weekSnap.data()
    const goals = wData.weeklyGoals ?? wData.goals ?? []
    if (goals.length > 0) {
      goalsStr = goals.map(g => `${g.done ? '[✓]' : '[ ]'} ${g.text}`).join('\n')
    }
    const noteSett = wData.noteSettimanali?.trim() ?? wData.note?.trim() ?? ''
    if (noteSett) noteSettStr = noteSett
  }

  // ── Profilo utente ────────────────────────────────────────────
  const userProfile = profiloSnap.exists()
    ? (profiloSnap.data().testo?.trim() || 'non compilato')
    : (localStorage.getItem('user_profile')?.trim() || 'non compilato')

  // ── System prompt personalizzato ──────────────────────────────
  const basePrompt = aiPromptSnap.exists()
    ? (aiPromptSnap.data().testo?.trim() || DEFAULT_SYSTEM)
    : (localStorage.getItem('ai_system_prompt')?.trim() || DEFAULT_SYSTEM)

  // ── Data di oggi in italiano ──────────────────────────────────
  const dataOggi = today.toLocaleDateString('it-IT', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const dataOggiLabel = dataOggi.charAt(0).toUpperCase() + dataOggi.slice(1)

  // ── Composizione finale ───────────────────────────────────────
  return [
    'Rispondi SOLO basandoti sui dati qui sotto.',
    'Se un dato non è presente scrivi esplicitamente che non ce l\'hai.',
    'Non fare mai supposizioni o inventare valori.',
    '',
    basePrompt,
    '',
    `DATA DI OGGI: ${dataOggiLabel}`,
    '',
    'DATI GIORNALIERI (oggi e ieri):',
    '',
    dayBlocks.join('\n\n'),
    '',
    'OBIETTIVI SETTIMANA CORRENTE:',
    goalsStr,
    '',
    `NOTE SETTIMANALI: ${noteSettStr}`,
    '',
    `PROFILO UTENTE: ${userProfile}`,
  ].join('\n')
}

// ════════════════════════════════════════════════════════════════
//  CHIAMATA AL PROXY FIREBASE
// ════════════════════════════════════════════════════════════════

async function callProxy(messages, systemPrompt, signal) {
  console.log('[ChatScreen] Chiamata a claudeProxy →', PROXY_URL)
  console.log('[ChatScreen] Messaggi inviati:', messages.length, '| Modello:', CLAUDE_MODEL)
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model:      CLAUDE_MODEL,
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   messages.map(m => ({ role: m.role, content: m.content })),
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `HTTP ${res.status}`)
  }

  const data = await res.json()
  if (data.error) throw new Error(data.error.message ?? 'Errore dal server')
  return data.content[0].text
}

// ════════════════════════════════════════════════════════════════
//  COMPONENTE
// ════════════════════════════════════════════════════════════════

// Prompt aggiuntivo per il saluto automatico all'apertura
const GREETING_INSTRUCTION =
  'L\'utente ha appena aperto la chat. Salutala brevemente e in modo naturale con una frase corta ' +
  'tipo "Ciao, dimmi pure" o simile. NON elencare dati, NON fare analisi, NON fare domande. ' +
  'Solo un saluto caldo e breve.'

export default function ChatScreen({ onBack }) {
  const [messages,       setMessages]       = useState([])
  const [input,          setInput]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [historyLoaded,  setHistoryLoaded]  = useState(false)
  const [greeting,       setGreeting]       = useState(true)  // sta eseguendo il saluto iniziale
  const [keyboardOffset, setKeyboardOffset] = useState(0)

  const bottomRef    = useRef(null)
  const inputRef     = useRef(null)
  const abortRef     = useRef(null)   // AbortController corrente

  // ── Mount: carica cronologia + genera saluto automatico ─────
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    abortRef.current = controller

    async function init() {
      // 1. Carica cronologia esistente
      const history = await loadHistoryFromFirestore()

      if (cancelled) return

      // 2. Mostra "..." mentre prepariamo il saluto
      setMessages([
        ...history,
        { role: 'assistant', content: '…', timestamp: Date.now(), isTyping: true },
      ])
      setLoading(true)

      try {
        // 3. Costruisci contesto fresco da Firestore
        const systemPrompt = await buildSystemPrompt()
        const greetSystem  = `${systemPrompt}\n\n${GREETING_INSTRUCTION}`

        // 4. Chiama l'AI con solo il messaggio di apertura (nessun history utente)
        const greetMsg = await callProxy(
          [{ role: 'user', content: 'apertura chat' }],
          greetSystem,
          controller.signal,
        )

        if (cancelled) return

        // 5. Sostituisci "..." con il saluto reale, preposto alla cronologia
        const greetBubble = { role: 'assistant', content: greetMsg, timestamp: Date.now() }
        setMessages([greetBubble, ...history])
      } catch (err) {
        if (cancelled) return
        if (err.name !== 'AbortError') {
          // In caso di errore mostra comunque il messaggio di benvenuto statico
          setMessages([{ role: 'assistant', content: WELCOME_MSG, timestamp: Date.now() }, ...history])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setGreeting(false)
          setHistoryLoaded(true)
        }
      }
    }

    init()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Salva su Firestore ad ogni aggiornamento (dopo il caricamento iniziale)
  // Non salviamo il saluto generativo — solo la cronologia "reale"
  useEffect(() => {
    if (!historyLoaded || greeting) return
    // Salva solo i messaggi a partire dal secondo (esclude il saluto generativo in cima)
    const toSave = messages.slice(1).filter(m => !m.isTyping)
    saveHistoryToFirestore(toSave)
  }, [messages, historyLoaded, greeting])

  // Scroll automatico all'ultimo messaggio
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Rilevamento tastiera virtuale mobile via visualViewport
  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        const bottomOffset =
          window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop
        setKeyboardOffset(bottomOffset > 0 ? bottomOffset : 0)
      }
    }
    window.visualViewport?.addEventListener('resize', handleResize)
    window.visualViewport?.addEventListener('scroll', handleResize)
    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize)
      window.visualViewport?.removeEventListener('scroll', handleResize)
    }
  }, [])

  // ── Stop risposta ────────────────────────────────────────────
  const stop = () => {
    if (abortRef.current) abortRef.current.abort()
  }

  // ── Invio messaggio ─────────────────────────────────────────
  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Escludi: il saluto generativo in cima (indice 0) e le bolle "isTyping"
      const apiHistory = [
        ...messages.filter((m, i) => i > 0 && !m.isTyping),
        userMsg,
      ]
      const systemPrompt = await buildSystemPrompt()
      const reply = await callProxy(apiHistory, systemPrompt, controller.signal)
      setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: Date.now() }])
    } catch (err) {
      if (err.name === 'AbortError') {
        // Fetch annullata — non aggiungere messaggio di errore
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Si è verificato un errore: ${err.message}`,
          timestamp: Date.now(),
        }])
      }
    } finally {
      abortRef.current = null
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  // ── Auto-resize textarea ────────────────────────────────────
  // line-height 22px + padding verticale 20px (10px top + 10px bottom)
  const SINGLE_ROW_H = 22 + 20   // altezza di 1 riga
  const MAX_H        = 22 * 5 + 20  // massimo 5 righe

  const autoResize = (el) => {
    if (!el) return
    el.style.height = 'auto'                          // reset → scrollHeight si ricalcola
    el.style.height = Math.min(el.scrollHeight, MAX_H) + 'px'
  }

  // Resetta l'altezza a 1 riga quando il testo viene svuotato
  useEffect(() => {
    if (!input && inputRef.current) {
      inputRef.current.style.height = SINGLE_ROW_H + 'px'
    }
  }, [input])

  const handleInputChange = (e) => {
    setInput(e.target.value)
    autoResize(e.target)
  }

  // Desktop: Enter invia, Shift+Enter e Ctrl+Enter vanno a capo
  // Mobile:  Enter va a capo, invio solo col pulsante ➤
  const isDesktop = window.matchMedia('(hover: hover)').matches

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return
    if (isDesktop) {
      if (e.shiftKey || e.ctrlKey) {
        // lascia inserire il newline — comportamento nativo
        return
      }
      e.preventDefault()
      send()
    }
    // su mobile non intercettiamo nulla
  }

  // ════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════

  return (
    <div className={styles.screen}>

      {/* ══ HEADER fisso ════════════════════════════════════════ */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={onBack} aria-label="Torna">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <p className={styles.headerTitle}>Il tuo Assistente</p>
      </header>

      {/* ══ MESSAGGI ════════════════════════════════════════════ */}
      <div
        className={styles.messages}
        style={{ paddingBottom: `${160 + keyboardOffset}px` }}
      >
        {messages.map((m, i) => (
          m.isTyping ? (
            /* Bolla animata "..." — usata durante il saluto iniziale */
            <div key={i} className={`${styles.bubble} ${styles.bubbleAssistant} ${styles.bubbleTyping}`}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          ) : (
            <div
              key={i}
              className={`${styles.bubble} ${m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant}`}
            >
              {m.content}
            </div>
          )
        ))}

        {/* Bolla animata durante l'invio di messaggi normali */}
        {loading && !greeting && (
          <div className={`${styles.bubble} ${styles.bubbleAssistant} ${styles.bubbleTyping}`}>
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ══ INPUT BAR ═══════════════════════════════════════════ */}
      <div
        className={styles.inputBar}
        style={{ bottom: `${keyboardOffset}px` }}
      >
        <textarea
          ref={inputRef}
          className={styles.inputField}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={greeting ? 'Preparazione in corso…' : 'Scrivi un messaggio…'}
          rows={1}
          disabled={loading}
        />

        {loading ? (
          /* Pulsante Stop */
          <button className={styles.stopBtn} onClick={stop} aria-label="Interrompi">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="#fff">
              <rect x="2" y="2" width="10" height="10" rx="2" />
            </svg>
          </button>
        ) : (
          /* Pulsante Invia */
          <button
            className={styles.sendBtn}
            onClick={send}
            disabled={!input.trim()}
            aria-label="Invia"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>

    </div>
  )
}
