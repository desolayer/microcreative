# MicroCreative — Telegram Mini App

Биржа микро-творческих заказов внутри Telegram.

## Быстрый старт

```bash
# 1. Установить зависимости
npm install

# 2. Запустить локально
npm run dev

# 3. Собрать для продакшена
npm run build
```

## Структура проекта

```
src/
├── components/
│   └── BottomNav.jsx       # Нижняя навигация
├── pages/
│   ├── FeedPage.jsx        # Лента заказов ✅
│   ├── CreateOrderPage.jsx # Создание заказа (в разработке)
│   ├── DealsPage.jsx       # Мои сделки (в разработке)
│   ├── DealPage.jsx        # Активная сделка (в разработке)
│   ├── WalletPage.jsx      # Кошелёк (в разработке)
│   ├── PaymentPage.jsx     # Оплата крипто (в разработке)
│   ├── ProfilePage.jsx     # Профиль (в разработке)
│   └── NotificationsPage.jsx # Уведомления (в разработке)
├── hooks/
│   └── useTelegram.js      # Хук для Telegram WebApp API ✅
├── store/
│   └── useStore.js         # Zustand глобальный стор ✅
└── utils/
    └── api.js              # Запросы к бэкенду ✅

## Подключение к Telegram

1. Создай бота через @BotFather
2. /newbot → получи токен
3. Задеплой фронтенд на Vercel
4. В @BotFather: /newapp → вставь URL Vercel
5. Готово!

## Переменные окружения

Создай файл `.env`:
```
VITE_API_URL=http://localhost:3000/api
```

## Платёжные системы

- **Telegram Stars** — встроен в TG, документы не нужны
- **TON** — через CryptoBot API (@CryptoBot в TG)
- **USDT/TRX/SOL/BTC** — через Cryptomus API

## Деплой

```bash
# Vercel (рекомендуется)
npm i -g vercel
vercel --prod
```
