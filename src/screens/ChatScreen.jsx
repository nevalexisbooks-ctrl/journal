// ─── ChatScreen — Chat con l'Assistente AI ───────────────────────────────────
// Prima di ogni invio raccoglie da Firestore:
//   - Ultimi 4 giorni da giorni/{YYYY-MM-DD}
//   - Goals e note settimanali da settimane/{YYYY-WNN}  (NON il menù)
//   - settings/ciclo per fase mestruale corrente
//   - Profilo utente da localStorage 'user_profile'
//   - System prompt da localStorage 'ai_system_prompt'
// La cronologia è persistente: salvata in localStorage 'chat_history'.
// La chiamata API passa per la Firebase Function claudeProxy (nessun CORS).
import React, { useState, useEffect, useRef } from 'react'
import { doc, getDoc } from 'firebase/firestore'
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

  const [daySnaps, weekSnap, cicloSnap] = await Promise.all([
    Promise.all(dayKeys.map(k => getDoc(doc(db, 'giorni', k)))),
    getDoc(doc(db, 'settimane', weekKey)),
    getDoc(doc(db, 'settings', 'ciclo')),
  ])

  // ── System prompt da localStorage ────────────────────────────
  const basePrompt = localStorage.getItem('ai_system_prompt')?.trim() || DEFAULT_SYSTEM

  // ── Data + profilo utente ─────────────────────────────────────
  const userProfile = localStorage.getItem('user_profile')?.trim() ?? ''
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

      // Task con testo completo e stato
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

async function callProxy(messages, systemPrompt) {
  console.log('[ChatScreen] Chiamata a claudeProxy →', PROXY_URL)
  console.log('[ChatScreen] Messaggi inviati:', messages.length, '| Modello:', CLAUDE_MODEL)
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

const CHAT_STORAGE_KEY = 'chat_history'
const WELCOME_MSG = 'Ciao! Sono qui per aiutarti a riflettere e crescere. Cosa hai in mente oggi? 🌱'

function loadHistory() {
  try {
    const saved = localStorage.getItem(CHAT_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return [{ role: 'assistant', content: WELCOME_MSG }]
}

export default function ChatScreen({ onBack }) {
  const [messages, setMessages] = useState(loadHistory)
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)

  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  // Persiste la cronologia ad ogni aggiornamento
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages))
    } catch {}
  }, [messages])

  // Scroll automatico all'ultimo messaggio
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Invio messaggio ─────────────────────────────────────────
  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      // History per l'API: solo messaggi user/assistant (escludi il primo benvenuto)
      const apiHistory = [
        ...messages.filter((_, i) => i > 0),
        userMsg,
      ]
      const systemPrompt = await buildSystemPrompt()
      const reply = await callProxy(apiHistory, systemPrompt)
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Si è verificato un errore: ${err.message}`,
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
      </header>

      {/* ══ MESSAGGI ════════════════════════════════════════════ */}
      <div className={styles.messages}>
        {messages.map((m, i) => (
          <div
            key={i}
            className={`${styles.bubble} ${m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant}`}
          >
            {m.content}
          </div>
        ))}

        {/* Indicatore "sta scrivendo…" */}
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
      <div className={styles.inputBar}>
        <textarea
          ref={inputRef}
          className={styles.inputField}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scrivi un messaggio…"
          rows={1}
          disabled={loading}
        />
        <button
          className={styles.sendBtn}
          onClick={send}
          disabled={loading || !input.trim()}
          aria-label="Invia"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

    </div>
  )
}
