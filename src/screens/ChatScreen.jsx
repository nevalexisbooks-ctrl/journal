// ─── ChatScreen — Chat con l'Assistente AI ───────────────────────────────────
// Contesto AI per ogni messaggio:
//   - Oggi e ieri da giorni/{YYYY-MM-DD}
//   - Obiettivi settimanali da settimane/{YYYY-WNN}  (NON il menù)
//   - Profilo utente da settings/profilo
//   - System prompt da settings/aiPrompt
//   - Memorie persistenti da collection `memoria`
//   - Ultimi 10 messaggi della cronologia
// Cronologia chat salvata su Firestore collection 'chat' doc 'storia'.
// Memoria persistente su collection `memoria` (auto-ID per voce).
// La chiamata API passa per la Firebase Function claudeProxy.
import React, { useState, useEffect, useRef } from 'react'
import { doc, getDoc, setDoc, collection, getDocs, addDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  toDateKey, toWeekKey, calcDayScore, calcCyclePhase, getPesiForDate,
} from '../utils/calcWidgets.js'
import styles from './ChatScreen.module.css'

// ── Costanti ────────────────────────────────────────────────────────────────────
const PROXY_URL = 'https://us-central1-journal-4782d.cloudfunctions.net/claudeProxy'

const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
  { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash'      },
  { id: 'gemini-3.5-flash',      label: 'Gemini 3.5 Flash'      },
]
const DEFAULT_MODEL = 'gemini-2.5-flash-lite'
// Estrazione memorie sempre sul modello più economico (indipendente dalla scelta utente)
const EXTRACT_MODEL = 'gemini-2.5-flash-lite'

const DEFAULT_SYSTEM =
  'Sei un assistente empatico e motivante. Hai accesso ai dati del journal degli ultimi giorni. ' +
  'Usa queste informazioni per rispondere in modo personalizzato, riconoscere pattern e offrire supporto. ' +
  'Rispondi sempre in italiano.'

const WELCOME_MSG = 'Ciao! Sono qui per aiutarti a riflettere e crescere. Cosa hai in mente oggi? 🌱'

const SAVE_PREFIX = 'salva questa informazione importante nelle memorie:'

const GREETING_INSTRUCTION =
  'L\'utente ha appena aperto la chat. Salutala brevemente e in modo naturale con una frase corta ' +
  'tipo "Ciao, dimmi pure" o simile. NON elencare dati, NON fare analisi, NON fare domande. ' +
  'Solo un saluto caldo e breve.'

// ════════════════════════════════════════════════════════════════
//  MEMORIA PERSISTENTE — collection `memoria`
// ════════════════════════════════════════════════════════════════

/** Carica tutte le voci di memoria ordinate per data decrescente */
async function loadMemorie() {
  try {
    const snap = await getDocs(collection(db, 'memoria'))
    const voci = []
    snap.forEach(d => voci.push({ id: d.id, ...d.data() }))
    // ordina per data decrescente
    voci.sort((a, b) => (b.data ?? 0) - (a.data ?? 0))
    return voci
  } catch (err) {
    console.warn('Errore caricamento memorie:', err)
    return []
  }
}

/** Salva una nuova voce di memoria */
async function saveMemoria(testo) {
  try {
    await addDoc(collection(db, 'memoria'), {
      testo: testo.trim(),
      data:  Date.now(),
    })
  } catch (err) {
    console.warn('Errore salvataggio memoria:', err)
  }
}

// ════════════════════════════════════════════════════════════════
//  PERSISTENZA CRONOLOGIA CHAT
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
//  COSTRUZIONE SYSTEM PROMPT
// ════════════════════════════════════════════════════════════════

async function buildSystemPrompt(memorie = []) {
  const today    = new Date()
  const todayKey = toDateKey(today)

  // Oggi e ieri (indice 0 = oggi, indice 1 = ieri)
  const last2   = Array.from({ length: 2 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    return d
  })
  const dayKeys = last2.map(d => toDateKey(d))
  const weekKey = toWeekKey(today)

  // Carica tutto in parallelo da Firestore
  const [daySnaps, weekSnap, cicloSnap, profiloSnap, aiPromptSnap, formulasSnap] = await Promise.all([
    Promise.all(dayKeys.map(k => getDoc(doc(db, 'giorni', k)))),
    getDoc(doc(db, 'settimane', weekKey)),
    getDoc(doc(db, 'settings', 'ciclo')),
    getDoc(doc(db, 'settings', 'profilo')),
    getDoc(doc(db, 'settings', 'aiPrompt')),
    getDoc(doc(db, 'settings', 'scoreFormulas')),
  ])
  const scoreVersions = formulasSnap.exists() ? (formulasSnap.data().versions ?? []) : []

  // ── Helpers ───────────────────────────────────────────────────
  const ni = 'non inserito'
  const vNum = (val, unit = '') =>
    (val != null && val !== '' && Number(val) !== 0) ? `${val}${unit}` : ni
  const vBool = (val) => (val == null ? ni : val ? 'Sì' : 'No')

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
    const dateObj   = last2[i]
    const dateKey   = dayKeys[i]
    const isToday   = dateKey === todayKey
    const dateLabel = dateObj.toLocaleDateString('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    const header = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)
    const lines  = [`--- ${header}${isToday ? ' (OGGI)' : ''} ---`]

    if (!snap.exists()) {
      lines.push(
        `Passi: ${ni}`, `Acqua: ${ni}`, `Social media: ${ni} minuti`,
        `Cyclette: ${ni} minuti`, `Yoga: ${ni} minuti`, `Zero zuccheri: ${ni}`,
        `Ore di sonno: ${ni}`, `Qualità sonno: ${ni}/10`,
        `Umore (faccine): ${ni}`, `Voto umore: ${ni}/10`,
        `Task del giorno: nessuna task`, `Small habits: nessuna habit`,
        `Note: nessuna nota`, `Voto giornaliero: non ancora calcolabile /10`,
        `Fase ciclo: ${getFaseFor(dateObj)}`,
      )
      return lines.join('\n')
    }

    const d  = snap.data()
    const ch = d.challenge ?? {}
    const sn = d.sonno     ?? {}
    const um = d.umore     ?? {}

    const todos = d.todos ?? []
    const taskStr = todos.length === 0
      ? 'nessuna task'
      : '\n' + todos.map(t => `  ${t.done ? '✓' : '○'} ${t.text}`).join('\n')

    const habits = d.habits ?? []
    const habitsStr = habits.length === 0
      ? 'nessuna habit'
      : '\n' + habits.map(h => `  ${h.done ? '✓' : '○'} ${h.text}`).join('\n')

    const facceList = Array.isArray(um.faccine) && um.faccine.length > 0
      ? um.faccine.join(' ') : ni

    const score   = calcDayScore(d, getPesiForDate(scoreVersions, dateKey))
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
  let goalsStr    = 'nessun obiettivo'
  let noteSettStr = 'nessuna nota'
  if (weekSnap.exists()) {
    const wData = weekSnap.data()
    const goals = wData.weeklyGoals ?? wData.goals ?? []
    if (goals.length > 0)
      goalsStr = goals.map(g => `${g.done ? '[✓]' : '[ ]'} ${g.text}`).join('\n')
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

  // ── Sezione memorie ───────────────────────────────────────────
  let memorieSection = ''
  if (memorie.length > 0) {
    const righe = memorie.map(m => {
      const d = m.data
        ? new Date(m.data).toLocaleDateString('it-IT', {
            day: 'numeric', month: 'long', year: 'numeric',
          })
        : '—'
      return `${d}: ${m.testo}`
    }).join('\n')
    memorieSection = `\nMEMORIE IMPORTANTI:\n${righe}\n`
  }

  // ── Composizione finale ───────────────────────────────────────
  return [
    'Rispondi SOLO basandoti sui dati qui sotto.',
    'Se un dato non è presente scrivi esplicitamente che non ce l\'hai.',
    'Non fare mai supposizioni o inventare valori.',
    '',
    basePrompt,
    memorieSection,
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

async function callProxy(messages, systemPrompt, signal, maxTokens = 350, model = DEFAULT_MODEL) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
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
//  ESTRAZIONE MEMORIA SILENZIOSA (dopo ogni risposta AI)
// ════════════════════════════════════════════════════════════════

const EXTRACT_SYSTEM =
  'Analizza l\'ultimo scambio di messaggi. ' +
  'C\'è qualcosa di veramente importante da memorizzare a lungo termine? ' +
  '(obiettivi importanti, eventi significativi, informazioni personali rilevanti emerse). ' +
  'Se sì, rispondi SOLO con un JSON valido in questo formato:\n{"testo": "..."}\n' +
  'Se non c\'è nulla di importante rispondi SOLO con: null\n' +
  'Non aggiungere niente altro, nessun testo fuori dal JSON.'

async function extractAndSaveMemory(userText, aiReply) {
  try {
    const raw = await callProxy(
      [
        { role: 'user',      content: userText  },
        { role: 'assistant', content: aiReply   },
        { role: 'user',      content: 'Analizza questo scambio come descritto nelle istruzioni.' },
      ],
      EXTRACT_SYSTEM,
      null,          // nessun signal — task in background
      150,           // max_tokens ridotto
      EXTRACT_MODEL, // sempre flash-lite per risparmiare
    )

    const trimmed = raw.trim()
    if (!trimmed || trimmed === 'null') return

    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed.testo === 'string' && parsed.testo.trim()) {
      await saveMemoria(parsed.testo)
      console.log('[Memoria] Salvata:', parsed.testo)
    }
  } catch (err) {
    // Silenzioso: non impatta l'esperienza utente
    console.warn('[Memoria] Estrazione fallita:', err.message)
  }
}

// ════════════════════════════════════════════════════════════════
//  COMPONENTE
// ════════════════════════════════════════════════════════════════

export default function ChatScreen({ onBack }) {
  const [messages,       setMessages]       = useState([])
  const [input,          setInput]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [historyLoaded,  setHistoryLoaded]  = useState(false)
  const [greeting,       setGreeting]       = useState(true)
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const [model,          setModel]          = useState(DEFAULT_MODEL)

  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const abortRef  = useRef(null)

  // ── Cambia modello e salva preferenza su Firestore ───────────
  const handleModelChange = async (newModel) => {
    setModel(newModel)
    try {
      await setDoc(doc(db, 'settings', 'aiPrompt'), { model: newModel }, { merge: true })
    } catch (err) {
      console.warn('Errore salvataggio modello:', err)
    }
  }

  // ── Mount: carica cronologia + memorie + modello + genera saluto
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    abortRef.current = controller

    async function init() {
      // 1. Carica cronologia, memorie e preferenza modello in parallelo
      const [history, memorie, aiPromptSnap] = await Promise.all([
        loadHistoryFromFirestore(),
        loadMemorie(),
        getDoc(doc(db, 'settings', 'aiPrompt')),
      ])
      if (cancelled) return

      const savedModel = aiPromptSnap.exists()
        ? (aiPromptSnap.data().model ?? DEFAULT_MODEL)
        : DEFAULT_MODEL
      setModel(savedModel)

      // 2. Mostra bolla "..." mentre il saluto viene generato
      setMessages([
        ...history,
        { role: 'assistant', content: '…', timestamp: Date.now(), isTyping: true },
      ])
      setLoading(true)

      try {
        // 3. Costruisce contesto fresco (con memorie)
        const systemPrompt = await buildSystemPrompt(memorie)
        const greetSystem  = `${systemPrompt}\n\n${GREETING_INSTRUCTION}`

        // 4. Chiama l'AI per il saluto con il modello salvato
        const greetMsg = await callProxy(
          [{ role: 'user', content: 'apertura chat' }],
          greetSystem,
          controller.signal,
          80,         // saluto: poche parole bastano
          savedModel, // usa il modello preferito caricato da Firestore
        )
        if (cancelled) return

        const greetBubble = { role: 'assistant', content: greetMsg, timestamp: Date.now() }
        setMessages([greetBubble, ...history])
      } catch (err) {
        if (cancelled) return
        if (err.name !== 'AbortError') {
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
    return () => { cancelled = true; controller.abort() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Salva su Firestore (escludi saluto generativo + bolle isTyping)
  useEffect(() => {
    if (!historyLoaded || greeting) return
    const toSave = messages.slice(1).filter(m => !m.isTyping)
    saveHistoryToFirestore(toSave)
  }, [messages, historyLoaded, greeting])

  // Scroll automatico
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Tastiera virtuale mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        const offset =
          window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop
        setKeyboardOffset(offset > 0 ? offset : 0)
      }
    }
    window.visualViewport?.addEventListener('resize', handleResize)
    window.visualViewport?.addEventListener('scroll', handleResize)
    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize)
      window.visualViewport?.removeEventListener('scroll', handleResize)
    }
  }, [])

  // ── Stop ─────────────────────────────────────────────────────
  const stop = () => { if (abortRef.current) abortRef.current.abort() }

  // ── Invio messaggio ─────────────────────────────────────────
  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    // ── Intercettazione: salvataggio forzato memoria ──────────
    if (text.toLowerCase().startsWith(SAVE_PREFIX)) {
      const info = text.slice(SAVE_PREFIX.length).trim()
      if (!info) return

      const userMsg = { role: 'user', content: text, timestamp: Date.now() }
      setMessages(prev => [...prev, userMsg])
      setInput('')
      setLoading(true)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const rephrasedText = await callProxy(
          [{ role: 'user', content: `Riformula questa informazione in modo chiaro e conciso per salvarla come memoria: ${info}` }],
          'Riformula il testo ricevuto in modo chiaro e conciso. Rispondi SOLO con il testo riformulato, senza aggiungere altro.',
          controller.signal,
          150,
        )
        await saveMemoria(rephrasedText)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '✓ Informazione salvata nelle memorie.',
          timestamp: Date.now(),
        }])
      } catch (err) {
        if (err.name !== 'AbortError') {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Errore durante il salvataggio: ${err.message}`,
            timestamp: Date.now(),
          }])
        }
      } finally {
        abortRef.current = null
        setLoading(false)
        inputRef.current?.focus()
      }
      return
    }

    // ── Invio normale ─────────────────────────────────────────
    const userMsg = { role: 'user', content: text, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    let aiReply = null
    try {
      // Cronologia reale: esclude saluto (indice 0) e bolle isTyping
      // Limita agli ultimi 10 messaggi
      const realHistory = messages
        .filter((m, i) => i > 0 && !m.isTyping)
        .slice(-10)

      const apiHistory = [...realHistory, userMsg]

      // Carica memorie fresche, poi costruisce contesto con esse
      const memorie = await loadMemorie()
      const systemPrompt = await buildSystemPrompt(memorie)

      aiReply = await callProxy(apiHistory, systemPrompt, controller.signal, 2500, model)
      setMessages(prev => [...prev, { role: 'assistant', content: aiReply, timestamp: Date.now() }])
    } catch (err) {
      if (err.name === 'AbortError') {
        // Stop premuto — nessun messaggio
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

    // ── Estrazione memoria in background (silenziosa) ─────────
    if (aiReply) {
      extractAndSaveMemory(text, aiReply)
    }
  }

  // ── Auto-resize textarea ─────────────────────────────────────
  const SINGLE_ROW_H = 22 + 20
  const MAX_H        = 22 * 5 + 20

  const autoResize = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, MAX_H) + 'px'
  }

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
  const isDesktop = window.matchMedia('(hover: hover)').matches
  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return
    if (isDesktop) {
      if (e.shiftKey || e.ctrlKey) return
      e.preventDefault()
      send()
    }
  }

  // ════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════

  return (
    <div className={styles.screen}>

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={onBack} aria-label="Torna">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <p className={styles.headerTitle}>Il tuo Assistente</p>
        <select
          className={styles.modelSelect}
          value={model}
          onChange={e => handleModelChange(e.target.value)}
          aria-label="Seleziona modello AI"
        >
          {GEMINI_MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </header>

      {/* ══ MESSAGGI ════════════════════════════════════════════ */}
      <div
        className={styles.messages}
        style={{ paddingBottom: `${160 + keyboardOffset}px` }}
      >
        {messages.map((m, i) => (
          m.isTyping ? (
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
          <button className={styles.stopBtn} onClick={stop} aria-label="Interrompi">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="#fff">
              <rect x="2" y="2" width="10" height="10" rx="2" />
            </svg>
          </button>
        ) : (
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
