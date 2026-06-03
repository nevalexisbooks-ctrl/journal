// ─── App root ────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react'
import HomeScreen          from './screens/HomeScreen.jsx'
import DetailScreen        from './screens/DetailScreen.jsx'
import WeeklyRecapScreen   from './screens/WeeklyRecapScreen.jsx'
import MonthlyViewScreen   from './screens/MonthlyViewScreen.jsx'
import ChatScreen          from './screens/ChatScreen.jsx'
import SettingsScreen      from './screens/SettingsScreen.jsx'
import PinScreen           from './screens/PinScreen.jsx'

export const SCREENS = {
  HOME:     'home',
  DETAIL:   'detail',
  WEEKLY:   'weekly',
  MONTHLY:  'monthly',
  CHAT:     'chat',
  SETTINGS: 'settings',
}

export default function App() {
  // PIN: sbloccato per tutta la sessione (non persiste su localStorage)
  const [unlocked,   setUnlocked]   = useState(false)

  const [screen,     setScreen]     = useState(SCREENS.HOME)
  // Data opzionale per aprire DetailScreen a una data specifica
  const [detailDate, setDetailDate] = useState(null)

  // ── Gestione tasto back fisico (popstate) ────────────────────
  // Ogni volta che si naviga a una schermata secondaria, si aggiunge
  // uno stato fittizio alla history. Quando il browser emette popstate
  // (back fisico), invece di uscire dall'app torniamo alla Homepage.
  const isSecondary = screen !== SCREENS.HOME
  const didPushRef  = useRef(false)

  useEffect(() => {
    if (!unlocked) return
    if (isSecondary) {
      // Aggiungi entry fittizia solo una volta per navigazione
      if (!didPushRef.current) {
        history.pushState({ journal: true }, '')
        didPushRef.current = true
      }
    } else {
      didPushRef.current = false
    }
  }, [screen, unlocked]) // eslint-disable-line

  useEffect(() => {
    function handlePopState() {
      // Intercetta il back: torna alla home senza uscire dall'app
      setScreen(SCREENS.HOME)
      setDetailDate(null)
      // Reinserisci subito lo stato in modo che il prossimo back venga ancora catturato
      // (necessario perché popstate ha già consumato la voce)
      didPushRef.current = false
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = (target) => setScreen(target)

  /** Apre DetailScreen alla data indicata (passata da MonthlyViewScreen) */
  const openDetailAt = (date) => {
    setDetailDate(date)
    setScreen(SCREENS.DETAIL)
  }

  if (!unlocked) {
    return <PinScreen onUnlocked={() => setUnlocked(true)} />
  }

  return (
    <>
      {screen === SCREENS.HOME     && <HomeScreen        navigate={navigate} />}
      {screen === SCREENS.DETAIL   && (
        <DetailScreen
          initialDate={detailDate}
          onBack={() => { setDetailDate(null); navigate(SCREENS.HOME) }}
        />
      )}
      {screen === SCREENS.WEEKLY   && <WeeklyRecapScreen onBack={() => navigate(SCREENS.HOME)} />}
      {screen === SCREENS.MONTHLY  && (
        <MonthlyViewScreen
          onBack={() => navigate(SCREENS.HOME)}
          onOpenDetail={openDetailAt}
        />
      )}
      {screen === SCREENS.CHAT     && <ChatScreen        onBack={() => navigate(SCREENS.HOME)} />}
      {screen === SCREENS.SETTINGS && <SettingsScreen    onBack={() => navigate(SCREENS.HOME)} />}
    </>
  )
}
