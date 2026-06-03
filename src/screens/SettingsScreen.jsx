// ─── SettingsScreen ───────────────────────────────────────────────────────────
// Gestisce: calendario ciclo, small habits, prompt AI, manutenzione dati.
// Firestore:
//   settings/ciclo   → { dataInizio, durataCiclo, durataflusso }
//   settings/habits  → { habits: [{id, text, startDate, endDate}] }
//   settings/aiPrompt → { prompt }
import React, { useState, useEffect, useRef } from 'react'
import {
  doc, getDoc, setDoc,
  collection, getDocs, writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase.js'
import styles from './SettingsScreen.module.css'

// ─── Default AI prompt ────────────────────────────────────────────────────────
const DEFAULT_AI_PROMPT =
  'Sei un assistente empatico e motivante. Hai accesso ai dati del journal degli ultimi giorni. ' +
  'Usa queste informazioni per rispondere in modo personalizzato, riconoscere pattern e offrire supporto.'

// ════════════════════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPALE
// ════════════════════════════════════════════════════════════════════════════

export default function SettingsScreen({ onBack }) {

  // ── Chi sono (localStorage) ───────────────────────────────────────────────
  const [userProfile,      setUserProfile]      = useState(() => localStorage.getItem('user_profile') ?? '')
  const [profileSaved,     setProfileSaved]     = useState(false)
  const profileTimerRef  = useRef(null)

  // Auto-save profilo 800ms dopo l'ultima modifica
  useEffect(() => {
    clearTimeout(profileTimerRef.current)
    profileTimerRef.current = setTimeout(() => {
      localStorage.setItem('user_profile', userProfile)
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 1500)
    }, 800)
    return () => clearTimeout(profileTimerRef.current)
  }, [userProfile])

  // ── Ciclo ─────────────────────────────────────────────────────────────────
  const [ciclo,       setCiclo]       = useState({ dataInizio: '', durataCiclo: 28, durataflusso: 5 })
  const [cicloSaving, setCicloSaving] = useState(false)
  const [cicloSaved,  setCicloSaved]  = useState(false)

  // ── Habits ────────────────────────────────────────────────────────────────
  const [habits,      setHabits]      = useState([])

  // ── AI Prompt ─────────────────────────────────────────────────────────────
  const [aiPrompt,    setAiPrompt]    = useState(DEFAULT_AI_PROMPT)

  // ── Gemini API Key (localStorage) ─────────────────────────────────────────
  const [geminiKey,     setGeminiKey]     = useState(() => localStorage.getItem('gemini_api_key') ?? '')
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [geminiSaved,   setGeminiSaved]   = useState(false)

  // ── Loading ───────────────────────────────────────────────────────────────
  const [loading,     setLoading]     = useState(true)

  // ── Refs debounce ─────────────────────────────────────────────────────────
  const habitsTimerRef   = useRef(null)
  const promptTimerRef   = useRef(null)
  const habitsReadyRef   = useRef(false)
  const promptReadyRef   = useRef(false)

  // ════════════════════════════════════════════════════════════════
  //  CARICAMENTO INIZIALE
  // ════════════════════════════════════════════════════════════════

  useEffect(() => {
    async function loadSettings() {
      try {
        const [cicloSnap, habitsSnap, promptSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'ciclo')),
          getDoc(doc(db, 'settings', 'habits')),
          getDoc(doc(db, 'settings', 'aiPrompt')),
        ])
        if (cicloSnap.exists())  setCiclo(cicloSnap.data())
        if (habitsSnap.exists()) setHabits(habitsSnap.data().habits ?? [])
        if (promptSnap.exists()) setAiPrompt(promptSnap.data().prompt ?? DEFAULT_AI_PROMPT)
      } catch (err) {
        console.error('Errore caricamento settings:', err)
      } finally {
        setLoading(false)
        // Attiva auto-save dopo il caricamento
        setTimeout(() => {
          habitsReadyRef.current = true
          promptReadyRef.current = true
        }, 50)
      }
    }
    loadSettings()
  }, [])

  // ════════════════════════════════════════════════════════════════
  //  AUTO-SAVE HABITS (debounced 700ms)
  // ════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!habitsReadyRef.current) return
    clearTimeout(habitsTimerRef.current)
    habitsTimerRef.current = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'settings', 'habits'), { habits }, { merge: true })
      } catch (err) { console.error('Errore salvataggio habits:', err) }
    }, 700)
    return () => clearTimeout(habitsTimerRef.current)
  }, [habits])

  // ════════════════════════════════════════════════════════════════
  //  AUTO-SAVE AI PROMPT (debounced 1000ms)
  // ════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!promptReadyRef.current) return
    clearTimeout(promptTimerRef.current)
    promptTimerRef.current = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'settings', 'aiPrompt'), { prompt: aiPrompt }, { merge: true })
      } catch (err) { console.error('Errore salvataggio prompt:', err) }
    }, 1000)
    return () => clearTimeout(promptTimerRef.current)
  }, [aiPrompt])

  // ════════════════════════════════════════════════════════════════
  //  HANDLERS — CICLO
  // ════════════════════════════════════════════════════════════════

  const setCicloField = (field) => (e) =>
    setCiclo(prev => ({ ...prev, [field]: e.target.value }))

  const saveCiclo = async () => {
    setCicloSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'ciclo'), ciclo, { merge: true })
      setCicloSaved(true)
      setTimeout(() => setCicloSaved(false), 2500)
    } catch (err) {
      console.error('Errore salvataggio ciclo:', err)
    } finally {
      setCicloSaving(false)
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  HANDLERS — HABITS
  // ════════════════════════════════════════════════════════════════

  const addHabit = () => {
    setHabits(prev => [...prev, { id: Date.now(), text: '', startDate: '', endDate: '' }])
  }

  const setHabitField = (id, field) => (e) =>
    setHabits(prev => prev.map(h => h.id === id ? { ...h, [field]: e.target.value } : h))

  const deleteHabit = (id) =>
    setHabits(prev => prev.filter(h => h.id !== id))

  // ════════════════════════════════════════════════════════════════
  //  HANDLERS — MANUTENZIONE
  // ════════════════════════════════════════════════════════════════

  const backupData = async () => {
    try {
      const [giorni, settimane, settingsGiorni] = await Promise.all([
        getDocs(collection(db, 'giorni')),
        getDocs(collection(db, 'settimane')),
        getDocs(collection(db, 'settings')),
      ])
      const backup = { giorni: {}, settimane: {}, settings: {} }
      giorni.forEach(d    => { backup.giorni[d.id]    = d.data() })
      settimane.forEach(d => { backup.settimane[d.id] = d.data() })
      settingsGiorni.forEach(d => { backup.settings[d.id] = d.data() })

      const blob = new Blob(
        [JSON.stringify(backup, null, 2)],
        { type: 'application/json' }
      )
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `journal-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Errore backup:', err)
      alert('Errore durante il backup: ' + err.message)
    }
  }

  const resetData = async () => {
    const ok = window.confirm(
      '⚠️ Sei sicura? Questa azione eliminerà TUTTI i dati di "giorni" e "settimane".\n' +
      'Le impostazioni (ciclo, habits, prompt) verranno mantenute.\n\n' +
      'Premi OK per confermare.'
    )
    if (!ok) return

    try {
      const [giorni, settimane] = await Promise.all([
        getDocs(collection(db, 'giorni')),
        getDocs(collection(db, 'settimane')),
      ])
      // writeBatch: max 500 ops — per uso personale è sufficiente
      const batch = writeBatch(db)
      giorni.forEach(d    => batch.delete(d.ref))
      settimane.forEach(d => batch.delete(d.ref))
      await batch.commit()
      alert('✓ Dati eliminati correttamente.')
    } catch (err) {
      console.error('Errore reset:', err)
      alert('Errore durante il reset: ' + err.message)
    }
  }

  const forceReload = () => window.location.reload(true)

  // ════════════════════════════════════════════════════════════════
  //  HANDLER — GEMINI API KEY
  // ════════════════════════════════════════════════════════════════

  const saveGeminiKey = () => {
    localStorage.setItem('gemini_api_key', geminiKey.trim())
    setGeminiSaved(true)
    setTimeout(() => setGeminiSaved(false), 2500)
  }

  // ════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className={styles.screen}>
        <header className={styles.header}>
          <button className={styles.backBtn} onClick={onBack} aria-label="Torna">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <p className={styles.headerTitle}>Settings</p>
        </header>
        <p className={styles.loadingText}>Caricamento…</p>
      </div>
    )
  }

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
        <p className={styles.headerTitle}>Settings</p>
      </header>

      <main className={styles.main}>

        {/* ── CHI SONO ────────────────────────────────────────── */}
        <section className={styles.cardWhite}>
          <h2 className={styles.blockTitle}>Chi sono</h2>
          <p className={styles.blockSub}>
            Queste informazioni vengono condivise con l'assistente AI per risponderti in modo più personalizzato.
          </p>
          <textarea
            className={styles.promptArea}
            value={userProfile}
            onChange={e => setUserProfile(e.target.value)}
            rows={5}
            placeholder="Nome, età, stile di vita, obiettivi, preferenze…"
          />
          <p className={styles.autoSaveNote}>
            {profileSaved ? '✓ Salvato' : 'Salvataggio automatico'}
          </p>
        </section>

        {/* ── CALENDARIO DEL CICLO ────────────────────────────── */}
        <section className={styles.cardWhite}>
          <h2 className={styles.blockTitle}>Calendario del Ciclo</h2>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Data inizio ultimo ciclo</label>
            <input
              className={styles.fieldInput}
              type="date"
              value={ciclo.dataInizio ?? ''}
              onChange={setCicloField('dataInizio')}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Durata media ciclo</label>
            <div className={styles.inputUnit}>
              <input
                className={`${styles.fieldInput} ${styles.inputShort}`}
                type="number" min="21" max="45"
                value={ciclo.durataCiclo ?? 28}
                onChange={setCicloField('durataCiclo')}
              />
              <span className={styles.unit}>giorni</span>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Durata media flusso</label>
            <div className={styles.inputUnit}>
              <input
                className={`${styles.fieldInput} ${styles.inputShort}`}
                type="number" min="1" max="10"
                value={ciclo.durataflusso ?? 5}
                onChange={setCicloField('durataflusso')}
              />
              <span className={styles.unit}>giorni</span>
            </div>
          </div>

          <button
            className={`${styles.btnPrimary} ${cicloSaved ? styles.btnSaved : ''}`}
            onClick={saveCiclo}
            disabled={cicloSaving}
          >
            {cicloSaving ? 'Salvataggio…' : cicloSaved ? '✓ Salvato' : 'Salva'}
          </button>
        </section>

        {/* ── SMALL HABITS ────────────────────────────────────── */}
        <section className={styles.cardSage}>
          <h2 className={styles.blockTitle}>Small Habits</h2>
          <p className={styles.blockSub}>
            Una habit appare in "Nel dettaglio" solo nelle date comprese nel suo intervallo.
          </p>

          <div className={styles.habitsList}>
            {habits.map(h => (
              <div key={h.id} className={styles.habitCard}>
                {/* Riga nome + elimina */}
                <div className={styles.habitNameRow}>
                  <input
                    className={styles.habitNameInput}
                    type="text"
                    value={h.text}
                    onChange={setHabitField(h.id, 'text')}
                    placeholder="Nome habit…"
                  />
                  <button
                    className={styles.habitDeleteBtn}
                    onClick={() => deleteHabit(h.id)}
                    aria-label="Elimina habit"
                  >✕</button>
                </div>

                {/* Date range */}
                <div className={styles.habitDates}>
                  <label className={styles.habitDateLabel}>
                    A partire da
                    <input
                      className={styles.habitDateInput}
                      type="date"
                      value={h.startDate ?? ''}
                      onChange={setHabitField(h.id, 'startDate')}
                    />
                  </label>
                  <label className={styles.habitDateLabel}>
                    Disattiva dal
                    <input
                      className={styles.habitDateInput}
                      type="date"
                      value={h.endDate ?? ''}
                      onChange={setHabitField(h.id, 'endDate')}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <button className={styles.btnAdd} onClick={addHabit}>
            + Aggiungi habit
          </button>
        </section>

        {/* ── PROMPT AI ───────────────────────────────────────── */}
        <section className={styles.cardWhite}>
          <h2 className={styles.blockTitle}>Prompt Assistente</h2>
          <p className={styles.blockSub}>
            Questo testo viene inviato come istruzione di sistema alla chat AI.
          </p>
          <textarea
            className={styles.promptArea}
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            rows={6}
          />
          <p className={styles.autoSaveNote}>Salvataggio automatico</p>

          <div className={styles.apiKeySection}>
            <label className={styles.fieldLabel}>API Key Gemini</label>
            <div className={styles.apiKeyRow}>
              <input
                className={`${styles.fieldInput} ${styles.apiKeyInput}`}
                type={showGeminiKey ? 'text' : 'password'}
                value={geminiKey}
                onChange={e => setGeminiKey(e.target.value)}
                placeholder="Incolla la tua API key…"
                autoComplete="off"
              />
              <button
                className={styles.btnToggleKey}
                onClick={() => setShowGeminiKey(v => !v)}
                type="button"
                aria-label={showGeminiKey ? 'Nascondi chiave' : 'Mostra chiave'}
              >
                {showGeminiKey ? '🙈' : '👁'}
              </button>
            </div>
            <button
              className={`${styles.btnPrimary} ${geminiSaved ? styles.btnSaved : ''}`}
              onClick={saveGeminiKey}
              style={{ marginTop: 10 }}
            >
              {geminiSaved ? '✓ Salvata' : 'Salva chiave'}
            </button>
          </div>
        </section>

        {/* ── MANUTENZIONE ────────────────────────────────────── */}
        <section className={styles.cardSand}>
          <h2 className={styles.blockTitle}>Manutenzione</h2>

          <div className={styles.maintButtons}>
            <button className={styles.btnMaint} onClick={backupData}>
              📦 Backup dei Dati
            </button>

            <button
              className={`${styles.btnMaint} ${styles.btnDanger}`}
              onClick={resetData}
            >
              🗑 Reset dei Dati
            </button>

            <button className={styles.btnMaint} onClick={forceReload}>
              🔄 Forza Aggiornamento
            </button>
          </div>
        </section>

      </main>
    </div>
  )
}
