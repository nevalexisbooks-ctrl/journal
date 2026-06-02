// ─── ChatScreen — Chat con l'Assistente AI ───────────────────────────────────
// Prima di ogni invio raccoglie da Firestore:
//   - Ultimi 4 giorni da giorni/{YYYY-MM-DD}
//   - Goals e note settimanali da settimane/{YYYY-WNN}  (NON il menù)
//   - System prompt da settings/aiPrompt
// La cronologia è in memoria React (non salvata su Firestore).
// API: Google Gemini generateContent via fetch (browser-side, richiede VITE_GEMINI_API_KEY nel .env)
import React, { useState, useEffect, useRef } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  toDateKey, toWeekKey, getMonday, getWeekDays, calcDayScore,
} from '../utils/calcWidgets.js'
import styles from './ChatScreen.module.css'

// ── Default prompt se non configurato ─────────────────────────────────────
const DEFAULT_SYSTEM =
  'Sei un assistente empatico e motivante. Hai accesso ai dati del journal degli ultimi giorni. ' +
  'Usa queste informazioni per rispondere in modo personalizzato, riconoscere pattern e offrire supporto. ' +
  'Rispondi sempre in italiano.'

// ════════════════════════════════════════════════════════════════
//  RACCOLTA CONTESTO DA FIRESTORE
// ════════════════════════════════════════════════════════════════

async function buildSystemPrompt() {
  const today = new Date()

  // Ultimi 4 giorni (incluso oggi)
  const last4 = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    return d
  })
  const dayKeys = last4.map(d => toDateKey(d))

  // Settimana corrente
  const weekKey = toWeekKey(today)

  // Carica tutto in parallelo
  const [daySnaps, weekSnap, promptSnap] = await Promise.all([
    Promise.all(dayKeys.map(k => getDoc(doc(db, 'giorni', k)))),
    getDoc(doc(db, 'settimane', weekKey)),
    getDoc(doc(db, 'settings', 'aiPrompt')),
  ])

  const basePrompt = promptSnap.exists()
    ? (promptSnap.data().prompt ?? DEFAULT_SYSTEM)
    : DEFAULT_SYSTEM

  // ── Formatta contesto giorni ──────────────────────────────────
  let ctx = '\n\n=== Dati degli ultimi 4 giorni ===\n'

  daySnaps.forEach((snap, i) => {
    const dateLabel = dayKeys[i]
    const score     = snap.exists() ? calcDayScore(snap.data()) : null
    ctx += `\n📅 ${dateLabel}${score !== null ? ` — Voto: ${score}/10` : ' — nessun dato'}\n`

    if (snap.exists()) {
      const d  = snap.data()
      const ch = d.challenge ?? {}

      if (Number(ch.passi) || Number(ch.acqua) || Number(ch.social) ||
          Number(ch.cyclette) || Number(ch.yoga) || ch.zeroZuccheri) {
        ctx += `  Challenge: passi ${ch.passi || 0}`
        if (Number(ch.acqua))    ctx += `, acqua ${ch.acqua}L`
        if (Number(ch.social))   ctx += `, social ${ch.social}min`
        if (Number(ch.cyclette)) ctx += `, cyclette ${ch.cyclette}min`
        if (Number(ch.yoga))     ctx += `, yoga ${ch.yoga}min`
        if (ch.zeroZuccheri)     ctx += `, zero zuccheri ✓`
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
        const done = todos.filter(t => t.done).length
        ctx += `  Task: ${done}/${todos.length} completate`
        const incomp = todos.filter(t => !t.done).slice(0, 2).map(t => t.text)
        if (incomp.length) ctx += ` (da fare: ${incomp.join(', ')})`
        ctx += '\n'
      }

      const habits = (d.habits ?? []).filter(h => h.done)
      if (habits.length > 0) {
        ctx += `  Small habits: ${habits.map(h => h.text).join(', ')}\n`
      }

      if (d.note?.trim()) ctx += `  Note: "${d.note.trim()}"\n`
    }
  })

  // ── Formatta contesto settimana ───────────────────────────────
  if (weekSnap.exists()) {
    const wData = weekSnap.data()
    const goals = wData.goals ?? []
    if (goals.length > 0) {
      ctx += '\n=== Obiettivi settimanali ===\n'
      goals.forEach(g => {
        ctx += `${g.done ? '[✓]' : '[ ]'} ${g.text}\n`
      })
    }
    // NON includere il menù (privato)
    if (wData.note?.trim()) {
      ctx += `\nNote settimana: "${wData.note.trim()}"\n`
    }
  }

  return basePrompt + ctx
}

// ════════════════════════════════════════════════════════════════
//  CHIAMATA API GEMINI
// ════════════════════════════════════════════════════════════════

async function callGemini(messages, systemPrompt) {
  const apiKey = localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('NO_API_KEY')
  }

  // Converti la history nel formato Gemini (role: user/model)
  const contents = messages.map(m => ({
    role:  m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
      }),
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `HTTP ${res.status}`)
  }

  const data = await res.json()
  return data.candidates[0].content.parts[0].text
}

// ════════════════════════════════════════════════════════════════
//  COMPONENTE
// ════════════════════════════════════════════════════════════════

const API_KEY_MISSING = !localStorage.getItem('gemini_api_key') && !import.meta.env.VITE_GEMINI_API_KEY

const WELCOME_MSG = API_KEY_MISSING
  ? 'Configura la tua API key Gemini nelle Impostazioni per usare l\'assistente.'
  : 'Ciao! Sono qui per aiutarti a riflettere e crescere. Cosa hai in mente oggi? 🌱'

export default function ChatScreen({ onBack }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: WELCOME_MSG }
  ])
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)

  const bottomRef   = useRef(null)
  const inputRef    = useRef(null)

  // Scroll automatico all'ultimo messaggio
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Invio messaggio ─────────────────────────────────────────
  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    if (API_KEY_MISSING) return

    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      // Costruisci history per l'API (escludi il messaggio di benvenuto del bot)
      const apiHistory = [...messages.filter(m => !(m.role === 'assistant' && m === messages[0])), userMsg]

      const systemPrompt = await buildSystemPrompt()
      const reply = await callGemini(
        apiHistory.map(m => ({ role: m.role, content: m.content })),
        systemPrompt
      )
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      const errMsg = err.message === 'NO_API_KEY'
        ? 'API key non configurata. Aggiungi VITE_GEMINI_API_KEY nel file .env'
        : `Errore: ${err.message}`
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg }])
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

        {/* Indicatore "sta scrivendo..." */}
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
          disabled={loading || API_KEY_MISSING}
        />
        <button
          className={styles.sendBtn}
          onClick={send}
          disabled={loading || !input.trim() || API_KEY_MISSING}
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
