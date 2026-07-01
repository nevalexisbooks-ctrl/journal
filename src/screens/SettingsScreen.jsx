// ─── SettingsScreen ───────────────────────────────────────────────────────────
// Gestisce: chi sono, calendario ciclo, small habits, manutenzione dati.
// Firestore:
//   settings/ciclo   → { dataInizio, durataCiclo, durataflusso }
//   settings/habits  → { habits: [{id, text, startDate, endDate}] }
import React, { useState, useEffect, useRef } from 'react'
import packageJson from '../../package.json'
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase.js'
import { DEFAULT_PESI, toDateKey } from '../utils/calcWidgets.js'
import styles from './SettingsScreen.module.css'

// ════════════════════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPALE
// ════════════════════════════════════════════════════════════════════════════

export default function SettingsScreen({ onBack }) {

  // ── Chi sono (Firestore settings/profilo) ────────────────────────────────
  const [userProfile, setUserProfile] = useState('')

  // Carica profilo da Firestore (con fallback a localStorage per migrazione)
  useEffect(() => {
    async function loadProfilo() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'profilo'))
        if (snap.exists()) {
          setUserProfile(snap.data().testo ?? '')
        } else {
          setUserProfile(localStorage.getItem('user_profile') ?? '')
        }
      } catch {
        setUserProfile(localStorage.getItem('user_profile') ?? '')
      }
    }
    loadProfilo()
  }, [])

  // ── Ciclo ─────────────────────────────────────────────────────────────────
  const [ciclo,       setCiclo]       = useState({ dataInizio: '', durataCiclo: 28, durataflusso: 5 })
  const [cicloSaving, setCicloSaving] = useState(false)
  const [cicloSaved,  setCicloSaved]  = useState(false)

  // ── Habits ────────────────────────────────────────────────────────────────
  const [habits,      setHabits]      = useState([])

  // ── Prompt AI (Firestore settings/aiPrompt) ───────────────────────────────
  const DEFAULT_PROMPT =
    'Sei un assistente empatico e motivante. Hai accesso ai dati del journal degli ultimi giorni. ' +
    'Usa queste informazioni per rispondere in modo personalizzato, riconoscere pattern e offrire supporto. ' +
    'Rispondi sempre in italiano.'
  const [aiPrompt, setAiPrompt] = useState('')

  // ── Stato salvataggio impostazioni ────────────────────────────────────────
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsSaved,  setSettingsSaved]  = useState(false)

  // ── Memorie assistente ────────────────────────────────────────────────────
  const [memorie,        setMemorie]        = useState([])   // [{id, testo, data}]
  const [memoriaEdit,    setMemoriaEdit]    = useState(null) // id in modifica
  const [memoriaText,    setMemoriaText]    = useState('')   // testo nell'input
  const [newMemoriaText, setNewMemoriaText] = useState('')   // nuova voce
  const [memoriaOpen,    setMemoriaOpen]    = useState(false)

  // ── Key Habits ───────────────────────────────────────────────────────────
  const [keyHabits, setKeyHabits] = useState([])

  // ── Formula Voto ─────────────────────────────────────────────────────────
  const [formulaOpen,   setFormulaOpen]   = useState(false)
  const [scoreVersions, setScoreVersions] = useState([])
  const [editPesi,      setEditPesi]      = useState({ ...DEFAULT_PESI })
  const [formulaSaving, setFormulaSaving] = useState(false)
  const [formulaSaved,  setFormulaSaved]  = useState(false)

  // ── Loading ───────────────────────────────────────────────────────────────
  const [loading,     setLoading]     = useState(true)

  // ── Refs debounce ─────────────────────────────────────────────────────────
  const habitsTimerRef      = useRef(null)
  const habitsReadyRef      = useRef(false)
  const keyHabitsTimerRef   = useRef(null)
  const keyHabitsReadyRef   = useRef(false)

  // ════════════════════════════════════════════════════════════════
  //  CARICAMENTO INIZIALE
  // ════════════════════════════════════════════════════════════════

  useEffect(() => {
    async function loadSettings() {
      try {
        const [cicloSnap, habitsSnap, keyHabitsSnap, profiloSnap, promptSnap, memorieSnap, formulasSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'ciclo')),
          getDoc(doc(db, 'settings', 'habits')),
          getDoc(doc(db, 'settings', 'keyHabits')),
          getDoc(doc(db, 'settings', 'profilo')),
          getDoc(doc(db, 'settings', 'aiPrompt')),
          getDocs(collection(db, 'memoria')),
          getDoc(doc(db, 'settings', 'scoreFormulas')),
        ])
        if (cicloSnap.exists())    setCiclo(cicloSnap.data())
        if (habitsSnap.exists())   setHabits(habitsSnap.data().habits ?? [])
        if (keyHabitsSnap.exists()) setKeyHabits(keyHabitsSnap.data().keyHabits ?? [])
        // Profilo: Firestore → localStorage → stringa vuota
        if (profiloSnap.exists()) {
          setUserProfile(profiloSnap.data().testo ?? '')
        } else {
          setUserProfile(localStorage.getItem('user_profile') ?? '')
        }
        // Prompt: Firestore → localStorage → default
        if (promptSnap.exists()) {
          setAiPrompt(promptSnap.data().testo ?? promptSnap.data().prompt ?? DEFAULT_PROMPT)
        } else {
          setAiPrompt(localStorage.getItem('ai_system_prompt') ?? DEFAULT_PROMPT)
        }
        // Memorie: carica e ordina per data decrescente
        const voci = []
        memorieSnap.forEach(d => voci.push({ id: d.id, ...d.data() }))
        voci.sort((a, b) => (b.data ?? 0) - (a.data ?? 0))
        setMemorie(voci)
        // Formula Voto: carica versioni; se non esiste crea la versione default con dataInizio = oggi
        if (formulasSnap.exists()) {
          const versions = formulasSnap.data().versions ?? []
          setScoreVersions(versions)
          if (versions.length > 0) {
            // Tiebreaker: indice array discendente → l'ultima versione salvata per stessa data vince
            const latest = versions
              .map((v, i) => ({ ...v, _i: i }))
              .sort((a, b) => b.dataInizio.localeCompare(a.dataInizio) || b._i - a._i)[0]
            setEditPesi({ ...DEFAULT_PESI, ...latest.pesi })
          }
        } else {
          const defaultVersion = { dataInizio: toDateKey(new Date()), pesi: { ...DEFAULT_PESI } }
          await setDoc(doc(db, 'settings', 'scoreFormulas'), { versions: [defaultVersion] }, { merge: true })
          setScoreVersions([defaultVersion])
        }
      } catch (err) {
        console.error('Errore caricamento settings:', err)
        setAiPrompt(DEFAULT_PROMPT)
      } finally {
        setLoading(false)
        setTimeout(() => {
          habitsReadyRef.current    = true
          keyHabitsReadyRef.current = true
        }, 50)
      }
    }
    loadSettings()
  }, []) // eslint-disable-line

  // ════════════════════════════════════════════════════════════════
  //  AUTO-SAVE HABITS / KEY HABITS (debounced 700ms)
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

  useEffect(() => {
    if (!keyHabitsReadyRef.current) return
    clearTimeout(keyHabitsTimerRef.current)
    keyHabitsTimerRef.current = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'settings', 'keyHabits'), { keyHabits }, { merge: true })
      } catch (err) { console.error('Errore salvataggio keyHabits:', err) }
    }, 700)
    return () => clearTimeout(keyHabitsTimerRef.current)
  }, [keyHabits])

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

  const moveHabit = (id, dir) => setHabits(prev => {
    const idx = prev.findIndex(h => h.id === id)
    const next = idx + dir
    if (next < 0 || next >= prev.length) return prev
    const arr = [...prev]
    ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
    return arr
  })

  // ════════════════════════════════════════════════════════════════
  //  HANDLERS — KEY HABITS
  // ════════════════════════════════════════════════════════════════

  const addKeyHabit = () => {
    setKeyHabits(prev => [...prev, { id: Date.now(), text: '', startDate: '', endDate: '' }])
  }

  const setKeyHabitField = (id, field) => (e) =>
    setKeyHabits(prev => prev.map(h => h.id === id ? { ...h, [field]: e.target.value } : h))

  const deleteKeyHabit = (id) =>
    setKeyHabits(prev => prev.filter(h => h.id !== id))

  const moveKeyHabit = (id, dir) => setKeyHabits(prev => {
    const idx = prev.findIndex(h => h.id === id)
    const next = idx + dir
    if (next < 0 || next >= prev.length) return prev
    const arr = [...prev]
    ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
    return arr
  })

  // ════════════════════════════════════════════════════════════════
  //  HANDLERS — FORMULA VOTO
  // ════════════════════════════════════════════════════════════════

  const sumPesi = Object.values(editPesi).reduce((a, b) => a + Number(b), 0)

  const saveFormulaVersion = async () => {
    if (sumPesi !== 100) return
    setFormulaSaving(true)
    try {
      const today      = toDateKey(new Date())
      const newPesi    = { ...editPesi }
      // Upsert: se esiste già una versione per oggi, aggiornala; altrimenti aggiungi
      const exists     = scoreVersions.some(v => v.dataInizio === today)
      const updated    = exists
        ? scoreVersions.map(v => v.dataInizio === today ? { dataInizio: today, pesi: newPesi } : v)
        : [...scoreVersions, { dataInizio: today, pesi: newPesi }]
      await setDoc(doc(db, 'settings', 'scoreFormulas'), { versions: updated }, { merge: true })
      setScoreVersions(updated)
      setFormulaSaved(true)
      setTimeout(() => setFormulaSaved(false), 2500)
    } catch (err) {
      console.error('Errore salvataggio formula:', err)
    } finally {
      setFormulaSaving(false)
    }
  }

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
      'Le impostazioni (ciclo, habits) verranno mantenute.\n\n' +
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

  const resetChat = async () => {
    const ok = window.confirm('Sei sicura di voler cancellare tutta la cronologia della chat?')
    if (!ok) return
    try {
      await setDoc(doc(db, 'chat', 'storia'), { messages: [], updatedAt: Date.now() })
      alert('✓ Chat resettata con successo.')
    } catch (err) {
      console.error('Errore reset chat:', err)
      alert('Errore durante il reset: ' + err.message)
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  HANDLERS — MEMORIE
  // ════════════════════════════════════════════════════════════════

  const addMemoria = async () => {
    const testo = newMemoriaText.trim()
    if (!testo) return
    try {
      const ref = await addDoc(collection(db, 'memoria'), { testo, data: Date.now() })
      setMemorie(prev => [{ id: ref.id, testo, data: Date.now() }, ...prev])
      setNewMemoriaText('')
    } catch (err) {
      console.error('Errore aggiunta memoria:', err)
    }
  }

  const startEditMemoria = (m) => {
    setMemoriaEdit(m.id)
    setMemoriaText(m.testo)
  }

  const confirmEditMemoria = async (id) => {
    if (!memoriaText.trim()) return
    try {
      await updateDoc(doc(db, 'memoria', id), { testo: memoriaText.trim() })
      setMemorie(prev => prev.map(m => m.id === id ? { ...m, testo: memoriaText.trim() } : m))
    } catch (err) {
      console.error('Errore aggiornamento memoria:', err)
    } finally {
      setMemoriaEdit(null)
      setMemoriaText('')
    }
  }

  const deleteMemoria = async (id) => {
    const ok = window.confirm('Eliminare questa voce di memoria?')
    if (!ok) return
    try {
      await deleteDoc(doc(db, 'memoria', id))
      setMemorie(prev => prev.filter(m => m.id !== id))
    } catch (err) {
      console.error('Errore eliminazione memoria:', err)
    }
  }

  const formatDataMemoria = (ts) => {
    if (!ts) return '—'
    return new Date(ts).toLocaleDateString('it-IT', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
  }

  const saveImpostazioni = async () => {
    setSettingsSaving(true)
    try {
      await Promise.all([
        setDoc(doc(db, 'settings', 'profilo'),  { testo: userProfile }, { merge: true }),
        setDoc(doc(db, 'settings', 'aiPrompt'), { testo: aiPrompt },    { merge: true }),
      ])
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2000)
    } catch (err) {
      console.error('Errore salvataggio impostazioni:', err)
      alert('Errore durante il salvataggio: ' + err.message)
    } finally {
      setSettingsSaving(false)
    }
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
        </section>

        {/* ── MEMORIA ASSISTENTE (collassabile) ───────────────── */}
        <section className={styles.cardWhite}>
          <button
            className={styles.collapseHeader}
            onClick={() => setMemoriaOpen(o => !o)}
            aria-expanded={memoriaOpen}
          >
            <h2 className={styles.blockTitle} style={{ margin: 0 }}>Memoria Assistente</h2>
            <span className={`${styles.collapseChevron} ${memoriaOpen ? styles.collapseOpen : ''}`}>▾</span>
          </button>

          {memoriaOpen && (
            <div className={styles.collapseBody}>
              <p className={styles.blockSub}>
                L'assistente salva automaticamente le informazioni importanti emerse nelle conversazioni.
                Puoi modificarle, eliminarle o aggiungerne di nuove.
              </p>

              {/* Aggiungi voce manuale */}
              <div className={styles.newMemoriaRow}>
                <input
                  className={styles.memoriaInput}
                  value={newMemoriaText}
                  onChange={e => setNewMemoriaText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addMemoria()}
                  placeholder="Aggiungi voce di memoria…"
                />
                <button
                  className={styles.memoriaConfirmBtn}
                  onClick={addMemoria}
                  aria-label="Aggiungi"
                >+</button>
              </div>

              {memorie.length === 0 ? (
                <p className={styles.memorieEmpty}>Nessuna memoria salvata ancora.</p>
              ) : (
                <ul className={styles.memorieList}>
                  {memorie.map(m => (
                    <li key={m.id} className={styles.memoriaItem}>
                      <span className={styles.memoriaData}>{formatDataMemoria(m.data)}</span>

                      {memoriaEdit === m.id ? (
                        <div className={styles.memoriaEditRow}>
                          <input
                            className={styles.memoriaInput}
                            value={memoriaText}
                            onChange={e => setMemoriaText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') confirmEditMemoria(m.id) }}
                            autoFocus
                          />
                          <button className={styles.memoriaConfirmBtn} onClick={() => confirmEditMemoria(m.id)}>✓</button>
                          <button className={styles.memoriaAnnullaBtn} onClick={() => { setMemoriaEdit(null); setMemoriaText('') }}>✕</button>
                        </div>
                      ) : (
                        <div className={styles.memoriaTextRow}>
                          <span className={styles.memoriaTesto}>{m.testo}</span>
                          <button className={styles.memoriaActionBtn} onClick={() => startEditMemoria(m)} title="Modifica">✏️</button>
                          <button className={`${styles.memoriaActionBtn} ${styles.memoriaDeleteBtn}`} onClick={() => deleteMemoria(m.id)} title="Elimina">✕</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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

        {/* ── FORMULA VOTO ────────────────────────────────────── */}
        <section className={styles.cardSand}>
          <button className={styles.collapseHeader} onClick={() => setFormulaOpen(o => !o)}>
            <h2 className={styles.blockTitle} style={{ margin: 0 }}>Formula Voto</h2>
            <span className={`${styles.collapseChevron} ${formulaOpen ? styles.collapseOpen : ''}`}>▾</span>
          </button>

          {formulaOpen && (
            <div className={styles.collapseBody}>
              {/* Formula statica — trasparenza */}
              <div className={styles.formulaText}>
                <p>VOTO = (Social + Workout + Acqua + ZeroJunkFood + Umore + Task + Sonno + SmallHabits + KeyHabits) ÷ 10</p>
                <p style={{ marginTop: 6 }}>
                  Social = %social × <b>PESO</b> / 100 &nbsp;|&nbsp;
                  Workout = %workout × <b>PESO</b> / 100 &nbsp;|&nbsp;
                  Acqua = %acqua × <b>PESO</b> / 100
                </p>
                <p>
                  ZeroJunkFood = sì → <b>PESO</b>, no → 0 &nbsp;|&nbsp;
                  Umore = (voto/10) × <b>PESO</b> &nbsp;|&nbsp;
                  Task = (fatte/tot) × <b>PESO</b>
                </p>
                <p>
                  Sonno = (qualità/10) × <b>PESO</b> &nbsp;|&nbsp;
                  SmallHabits: 0→0 | 1→<b>PESO</b>/2 | 2+→<b>PESO</b> &nbsp;|&nbsp;
                  KeyHabits: 0→0 | 1→<b>PESO</b>/2 | 2+→<b>PESO</b>
                </p>
                <p style={{ marginTop: 4, fontStyle: 'italic' }}>Vincolo: la somma di tutti i pesi deve essere 100.</p>
              </div>

              {/* Input pesi */}
              <div className={styles.pesiGrid}>
                {[
                  ['social',       'Social'],
                  ['workout',      'Workout'],
                  ['acqua',        'Acqua'],
                  ['zeroZuccheri', 'Zero Junk Food'],
                  ['umore',        'Umore'],
                  ['task',         'Task'],
                  ['sonno',        'Sonno'],
                  ['smallHabits',  'Small Habits'],
                  ['keyHabits',    'Key Habits'],
                ].map(([key, label]) => (
                  <div key={key} className={styles.pesoRow}>
                    <span className={styles.pesoLabel}>{label}</span>
                    <input
                      className={`${styles.fieldInput} ${styles.inputShort}`}
                      type="number" min="0" max="100"
                      value={editPesi[key] ?? 0}
                      onChange={e => setEditPesi(p => ({ ...p, [key]: Number(e.target.value) }))}
                    />
                  </div>
                ))}
              </div>

              {/* Somma in tempo reale */}
              <div className={`${styles.pesoSum} ${sumPesi !== 100 ? styles.pesoSumWarn : styles.pesoSumOk}`}>
                Somma pesi: <strong>{sumPesi}</strong> / 100
                {sumPesi !== 100 && <span> — deve essere esattamente 100</span>}
              </div>

              {/* Storico versioni */}
              {scoreVersions.length > 0 && (
                <div className={styles.formulaHistory}>
                  <p className={styles.formulaHistoryTitle}>Versioni salvate ({scoreVersions.length})</p>
                  {[...scoreVersions]
                    .sort((a, b) => b.dataInizio.localeCompare(a.dataInizio))
                    .map((v, i) => (
                      <p key={i} className={styles.formulaHistoryRow}>
                        {v.dataInizio} — somma {Object.values(v.pesi).reduce((a,b) => a+b, 0)} pt
                      </p>
                    ))
                  }
                </div>
              )}

              <button
                className={`${styles.btnPrimary} ${formulaSaved ? styles.btnSaved : ''}`}
                onClick={saveFormulaVersion}
                disabled={formulaSaving || sumPesi !== 100}
                style={{ marginTop: 14 }}
              >
                {formulaSaving ? 'Salvataggio…' : formulaSaved ? '✓ Versione salvata' : 'Salva nuova versione'}
              </button>
            </div>
          )}
        </section>

        {/* ── KEY HABITS ──────────────────────────────────────── */}
        <section className={styles.cardWhite}>
          <h2 className={styles.blockTitle}>Key Habits</h2>
          <p className={styles.blockSub}>
            Habit principali, mostrate sopra le Small Habits in "Nel dettaglio".
          </p>

          <div className={styles.habitsList}>
            {keyHabits.map((h, idx) => (
              <div key={h.id} className={styles.habitCard}>
                <div className={styles.habitNameRow}>
                  <div className={styles.habitOrderBtns}>
                    <button className={styles.habitOrderBtn} onClick={() => moveKeyHabit(h.id, -1)} disabled={idx === 0} aria-label="Sposta su">↑</button>
                    <button className={styles.habitOrderBtn} onClick={() => moveKeyHabit(h.id, 1)} disabled={idx === keyHabits.length - 1} aria-label="Sposta giù">↓</button>
                  </div>
                  <input
                    className={styles.habitNameInput}
                    type="text"
                    value={h.text}
                    onChange={setKeyHabitField(h.id, 'text')}
                    placeholder="Nome habit…"
                  />
                  <button
                    className={styles.habitDeleteBtn}
                    onClick={() => deleteKeyHabit(h.id)}
                    aria-label="Elimina key habit"
                  >✕</button>
                </div>
                <div className={styles.habitDates}>
                  <label className={styles.habitDateLabel}>
                    A partire da
                    <input
                      className={styles.habitDateInput}
                      type="date"
                      value={h.startDate ?? ''}
                      onChange={setKeyHabitField(h.id, 'startDate')}
                    />
                  </label>
                  <label className={styles.habitDateLabel}>
                    Disattiva dal
                    <input
                      className={styles.habitDateInput}
                      type="date"
                      value={h.endDate ?? ''}
                      onChange={setKeyHabitField(h.id, 'endDate')}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <button className={styles.btnAdd} onClick={addKeyHabit}>
            + Aggiungi key habit
          </button>
        </section>

        {/* ── SMALL HABITS ────────────────────────────────────── */}
        <section className={styles.cardSage}>
          <h2 className={styles.blockTitle}>Small Habits</h2>
          <p className={styles.blockSub}>
            Una habit appare in "Nel dettaglio" solo nelle date comprese nel suo intervallo.
          </p>

          <div className={styles.habitsList}>
            {habits.map((h, idx) => (
              <div key={h.id} className={styles.habitCard}>
                <div className={styles.habitNameRow}>
                  <div className={styles.habitOrderBtns}>
                    <button className={styles.habitOrderBtn} onClick={() => moveHabit(h.id, -1)} disabled={idx === 0} aria-label="Sposta su">↑</button>
                    <button className={styles.habitOrderBtn} onClick={() => moveHabit(h.id, 1)} disabled={idx === habits.length - 1} aria-label="Sposta giù">↓</button>
                  </div>
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
            Questo testo viene inviato come istruzione di sistema all'assistente AI.
          </p>
          <textarea
            className={styles.promptArea}
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            rows={6}
          />
          <div className={styles.apiKeyNote}>
            🔒 La chiave API è configurata in modo sicuro sul server
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

            <button
              className={`${styles.btnMaint} ${styles.btnDanger}`}
              onClick={resetChat}
            >
              💬 Reset Chat Assistente
            </button>
          </div>
        </section>

      </main>

      {/* ── PULSANTE SALVA IMPOSTAZIONI ──────────────────────── */}
      <div className={styles.saveSettingsWrapper}>
        {settingsSaved && (
          <p className={styles.saveSettingsConfirm}>✓ Impostazioni salvate!</p>
        )}
        <button
          className={styles.btnSaveSettings}
          onClick={saveImpostazioni}
          disabled={settingsSaving}
        >
          {settingsSaving ? 'Salvataggio…' : 'Salva Impostazioni'}
        </button>
      </div>

      <p className={styles.appVersion}>v{packageJson.version}</p>
    </div>
  )
}
