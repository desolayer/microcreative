// Хук для работы с Telegram WebApp API
// Автоматически даёт нам данные пользователя без логина!

export const useTelegram = () => {
  const tg = window.Telegram?.WebApp

  // Данные юзера прямо из Telegram — никакой регистрации не нужно
  const user = tg?.initDataUnsafe?.user || {
    id: 12345,
    first_name: 'Маша',
    last_name: 'Крылова',
    username: 'masha_design',
    photo_url: null,
  }

  const onClose = () => tg?.close()

  // Показываем нативную кнопку Telegram внизу
  const showMainButton = (text, onClick) => {
    if (!tg) return
    tg.MainButton.setText(text)
    tg.MainButton.show()
    tg.MainButton.onClick(onClick)
  }

  const hideMainButton = () => {
    tg?.MainButton.hide()
  }

  // Вибрация (haptic feedback) — делает приложение живым
  const haptic = (type = 'light') => {
    tg?.HapticFeedback.impactOccurred(type)
    // type: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
  }

  // Нативный попап Telegram
  const showAlert = (message) => {
    tg?.showAlert(message)
  }

  const showConfirm = (message, callback) => {
    tg?.showConfirm(message, callback)
  }

  // Данные для авторизации на сервере (подпись от Telegram)
  const initData = tg?.initData || ''

  // Тема Telegram (light/dark)
  const colorScheme = tg?.colorScheme || 'dark'

  return {
    tg,
    user,
    initData,
    colorScheme,
    onClose,
    showMainButton,
    hideMainButton,
    haptic,
    showAlert,
    showConfirm,
  }
}
