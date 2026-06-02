// ─── HomeScreen ───────────────────────────────────────────────────────────────
import React from 'react'
import styles from './HomeScreen.module.css'
import { SCREENS } from '../App.jsx'

import Header          from '../components/Header.jsx'
import ComeVaOggiCard  from '../components/ComeVaOggiCard.jsx'
import JournalCard     from '../components/JournalCard.jsx'
import WeeklyRecapCard from '../components/WeeklyRecapCard.jsx'
import MonthlyViewCard from '../components/MonthlyViewCard.jsx'

export default function HomeScreen({ navigate }) {
  return (
    <div className={styles.screen}>

      <Header onSettingsClick={() => console.log('Impostazioni')} />

      <main className={styles.main}>

        {/* Pulsante "!" → apre DetailScreen */}
        <ComeVaOggiCard
          onInfoClick={() => navigate(SCREENS.DETAIL)}
        />

        {/* Journal / Chat */}
        <JournalCard
          onClick={() => console.log('Journal — TODO')}
        />

        <div className={styles.twoCols}>
          {/* Quadrante Weekly → apre WeeklyRecapScreen */}
          <WeeklyRecapCard
            onClick={() => navigate(SCREENS.WEEKLY)}
          />

          {/* Quadrante Monthly → TODO */}
          <MonthlyViewCard
            onClick={() => console.log('Monthly — TODO')}
          />
        </div>

      </main>
    </div>
  )
}
