import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Инициализируем Telegram WebApp
const tg = window.Telegram?.WebApp

if (tg) {
  tg.ready()           // Говорим TG что приложение загрузилось
  tg.expand()          // Разворачиваем на весь экран
  tg.disableVerticalSwipes() // Отключаем свайп вниз (закрытие)
  
  // Устанавливаем цвет хедера под наш дизайн
  tg.setHeaderColor('#0f0f0f')
  tg.setBackgroundColor('#0f0f0f')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
