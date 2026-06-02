// ─── HomeScreen ───────────────────────────────────────────────────────────
// Schermata principale. Riceve da App:
//   navigate     — funzione per cambiare schermata
//   widgetData   — { social, workout, water } calcolati in DetailScreen
//   topTasks     — prime 3 task non completate (da DetailScreen)
import React from 'react'
import styles from './HomeScreen.module.css'
import { SCREENS } from '../App.jsx'

import Header          from '../components/Header.jsx'
import ComeVaOggiCard  from '../components/ComeVaOggiCard.jsx'
import JournalCard     from '../components/JournalCard.jsx'
import WeeklyRecapCard from '../components/WeeklyRecapCard.jsx'
import MonthlyViewCard from '../components/MonthlyViewCard.jsx'

export default function HomeScreen({ navigate, widgetData, topTasks }) {
  return (
    <div className={styles.screen}>

      {/* ── Header verde salvia ── */}
      <Header
        onSettingsClick={() => {
          // TODO: aprire schermata/modal impostazioni
          console.log('Impostazioni')
        }}
      />

      {/* ── Contenuto scorrevole ── */}
      <main className={styles.main}>

        {/* Box "Come va oggi?" — pulsante "!" naviga a DetailScreen */}
        <ComeVaOggiCard
          widgetData={widgetData}
          onInfoClick={() => navigate(SCREENS.DETAIL)}
        />

        {/* Box Journal / Chat AI */}
        <JournalCard
          onClick={() => {
            // TODO: navigate(SCREENS.JOURNAL) quando la schermata sarà pronta
            console.log('Journal')
          }}
        />

        {/* Due quadranti affiancati */}
        <div className={styles.twoCols}>

          <WeeklyRecapCard
            topTasks={topTasks}
            onClick={() => {
              // TODO: navigate(SCREENS.WEEKLY)
              console.log('Weekly recap')
            }}
          />

          <MonthlyViewCard
            onClick={() => {
              // TODO: navigate(SCREENS.MONTHLY)
              console.log('Monthly view')
            }}
          />

        </div>

      </main>
    </div>
  )
}
