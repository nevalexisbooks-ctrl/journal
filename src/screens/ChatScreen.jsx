// ─── ChatScreen — Chat con l'Assistente AI ───────────────────────────────────
// Prima di ogni invio raccoglie da Firestore:
//   - Ultimi 4 giorni da giorni/{YYYY-MM-DD}
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
const CLAUDE_MODEL = 'claude-sonnet-4-5'

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
  const today = new Date()
  const todayKey = toDateKey(today)

  // ── Data corrente in italiano ─────────────────────────────────
  const dataOggi = today.toLocaleDateString('it-IT', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  // Ultimi 4 giorni (incluso oggi)
  const last4 = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    return d
  })
  const dayKeys = last4.map(d => toDateKey(d))
  const weekKey = toWeekKey(today)

  const [daySnaps, weekSnap, cicloSnap, profiloSnap] = await Promise.all([
    Promise.all(dayKeys.map(k => getDoc(doc(db, 'giorni', k)))),
    getDoc(doc(db, 'settimane', weekKey)),
    getDoc(doc(db, 'settings', 'ciclo')),
    getDoc(doc(db, 'settings', 'profilo')),
  ])

  // ── System prompt da localStorage ────────────────────────────
  const basePrompt = localStorage.getItem('ai_system_prompt')?.trim() || DEFAULT_SYSTEM

  // ── Profilo utente da Firestore ───────────────────────────────
  const userProfile = profiloSnap.exists()
    ? (profiloSnap.data().testo?.trim() ?? '')
    : (localStorage.getItem('user_profile')?.trim() ?? '')
  const profileSection = userProfile ? `\n\n=== Chi sono ===\n${userProfile}\n` : ''

  // ── Ciclo mestruale ───────────────────────────────────────────
  let cicloSection = ''
  if (cicloSnap.exists()) {
    const c = cicloSnap.data()
    if (c.dataInizio) {
      const ph = calcCyclePhase(c.dataInizio, c.durataCiclo, c.durataflusso, today)
      const PHASE_NAMES = ['Mestruale', 'Follicolare', 'Ovulatoria', 'Luteale']
      cicloSection =
        `\n\n=== Ciclo mestruale ===\n` +
        `Fase: ${PHASE_NAMES[ph.phaseIdx]} — Giorno ${ph.dayInCycle} del ciclo\n` +
        `Inizio ultimo ciclo: ${c.dataInizio}\n` +
        `Durata media ciclo: ${c.durataCiclo ?? 28} giorni\n`
    }
  }

  // ── Formatta contesto giorni ──────────────────────────────────
  let ctx = '\n\n=== Dati degli ultimi 4 giorni ===\n'

  daySnaps.forEach((snap, i) => {
    const dateLabel = dayKeys[i]
    const isToday   = dateLabel === todayKey
    const score     = snap.exists() ? calcDayScore(snap.data()) : null

    let scoreLabel = ''
    if (score !== null) {
      scoreLabel = ` — Voto: ${score}/10`
      if (isToday) scoreLabel += ' (provvisorio, cambierà con i dati della giornata)'
    }
    ctx += `\n📅 ${dateLabel}${score !== null ? scoreLabel : ' — nessun dato'}\n`

    if (snap.exists()) {
      const d  = snap.data()
      const ch = d.challenge ?? {}

      if (Number(ch.passi) || Number(ch.acqua) || Number(ch.social) ||
          Number(ch.cyclette) || Number(ch.yoga) || ch.zeroZuccheri != null) {
        ctx += `  Challenge: passi ${ch.passi || 0}`
        if (Number(ch.acqua))    ctx += `, acqua ${ch.acqua}L`
        if (Number(ch.social))   ctx += `, social ${ch.social}min`
        if (Number(ch.cyclette)) ctx += `, cyclette ${ch.cyclette}min`
        if (Number(ch.yoga))     ctx += `, yoga ${ch.yoga}min`
        ctx += `, zero zuccheri: ${ch.zeroZuccheri ? 'Sì' : 'No'}`
        ctx += '\n'
      }

      const sn = d.sonno ?? {}
      if (sn.dalle && sn.alle) {
        ctx += `  Sonno: ${sn.dalle}–${sn.alle}`
        if (sn.qualita) ctx += `, qualità ${sn.qualita}/10`
        ctx += '\n'
      }

      const um = d.umore ?? {}
      if (um.voto) ctx += `  Umore: ${um.voto}/10\n`

      const todos = d.todos ?? []
      if (todos.length > 0) {
        ctx += `  Task:\n`
        todos.forEach(t => {
          ctx += `    - ${t.text} (${t.done ? 'completata' : 'non completata'})\n`
        })
      }

      const habits = (d.habits ?? []).filter(h => h.done)
      if (habits.length > 0) ctx += `  Small habits: ${habits.map(h => h.text).join(', ')}\n`
      if (d.note?.trim())    ctx += `  Note: "${d.note.trim()}"\n`
    }
  })

  // ── Formatta contesto settimana ───────────────────────────────
  if (weekSnap.exists()) {
    const wData = weekSnap.data()
    const goals = wData.goals ?? []
    if (goals.length > 0) {
      ctx += '\n=== Obiettivi settimanali ===\n'
      goals.forEach(g => { ctx += `${g.done ? '[✓]' : '[ ]'} ${g.text}\n` })
    }
    if (wData.note?.trim()) ctx += `\nNote settimana: "${wData.note.trim()}"\n`
  }

  return `Oggi è ${dataOggi}.\n\n${basePrompt}${profileSection}${cicloSection}${ctx}`
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

export default function ChatScreen({ onBack }) {
  const [messages,       setMessages]       = useState([{ role: 'assistant', content: WELCOME_MSG }])
  const [input,          setInput]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [historyLoaded,  setHistoryLoaded]  = useState(false)
  const [keyboardOffset, setKeyboardOffset] = useState(0)

  const bottomRef    = useRef(null)
  const inputRef     = useRef(null)
  const abortRef     = useRef(null)   // AbortController corrente

  // Carica cronologia da Firestore al mount
  useEffect(() => {
    loadHistoryFromFirestore().then(msgs => {
      setMessages(msgs)
      setHistoryLoaded(true)
    })
  }, [])

  // Salva su Firestore ad ogni aggiornamento (dopo il caricamento iniziale)
  useEffect(() => {
    if (!historyLoaded) return
    saveHistoryToFirestore(messages)
  }, [messages, historyLoaded])

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
      const apiHistory = [
        ...messages.filter((_, i) => i > 0),
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

  // Desktop (hover: hover): Enter invia, Ctrl+Enter va a capo
  // Mobile: Enter va a capo, invio solo con pulsante ➤
  const isDesktop = window.matchMedia('(hover: hover)').matches

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return
    if (isDesktop && !e.ctrlKey) {
      e.preventDefault()
      send()
    } else if (isDesktop && e.ctrlKey) {
      // lascia andare a capo — comportamento nativo
    }
    // su mobile non intercettiamo nulla: Enter va a capo normalmente
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
          <div
            key={i}
            className={`${styles.bubble} ${m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant}`}
          >
            {m.content}
          </div>
        ))}

        {loading && (
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
          placeholder="Scrivi un messaggio…"
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
