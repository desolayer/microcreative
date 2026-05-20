# MicroCreative Backend

Node.js + Express + PostgreSQL бэкенд для Telegram Mini App.

## Быстрый старт

```bash
cd backend
npm install

# Скопируй и заполни переменные окружения
cp .env.example .env

# Создай базу данных
createdb microcreative

# Запусти миграцию
npm run migrate

# Запусти в dev-режиме
npm run dev
```

## Структура

```
src/
├── app.js                    # Express приложение, все роуты
├── config/
│   ├── env.js                # Переменные окружения
│   └── database.js           # PostgreSQL pool + транзакции
├── middleware/
│   ├── auth.js               # Telegram initData авторизация
│   └── errorHandler.js       # Глобальная обработка ошибок
├── routes/
│   ├── orders.js             # CRUD заказов, отклики
│   ├── deals.js              # Сделки, чат, эскроу-операции
│   ├── wallet.js             # Баланс, история, вывод
│   ├── payments.js           # CryptoBot/Cryptomus инвойсы + вебхуки
│   ├── profile.js            # Профили пользователей
│   └── notifications.js      # Уведомления
├── services/
│   ├── escrow.js             # Заморозка/разморозка/возврат эскроу
│   ├── cryptobot.js          # CryptoBot API (TON, USDT...)
│   └── cryptomus.js          # Cryptomus API (USDT/TRX, SOL, BTC)
└── db/
    ├── migrate.js            # Скрипт запуска миграций
    └── migrations/
        └── 001_initial.sql   # Схема БД
```

## API

### Авторизация
Каждый запрос должен содержать заголовок:
```
X-Telegram-Init-Data: <initData из Telegram.WebApp.initData>
```

### Роуты

| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/orders | Лента заказов (фильтр по category) |
| POST | /api/orders | Создать заказ |
| GET | /api/orders/:id | Детали заказа |
| POST | /api/orders/:id/respond | Откликнуться |
| GET | /api/orders/:id/responses | Отклики (только для автора) |
| POST | /api/orders/:id/responses/:responseId/accept | Принять отклик |
| GET | /api/deals | Мои сделки |
| GET | /api/deals/:id | Детали сделки |
| GET | /api/deals/:id/messages | Сообщения |
| POST | /api/deals/:id/messages | Отправить сообщение |
| POST | /api/deals/:id/activate | Активировать (заморозить эскроу) |
| POST | /api/deals/:id/complete | Подтвердить выполнение |
| POST | /api/deals/:id/dispute | Открыть спор |
| POST | /api/deals/:id/cancel | Отменить сделку |
| GET | /api/wallet/balance | Баланс кошелька |
| GET | /api/wallet/history | История транзакций |
| POST | /api/wallet/withdraw | Вывод средств |
| POST | /api/payments/cryptobot | Инвойс CryptoBot |
| POST | /api/payments/cryptomus | Инвойс Cryptomus |
| GET | /api/payments/:id/status | Статус платежа |
| POST | /api/webhooks/cryptobot | Вебхук от CryptoBot |
| POST | /api/webhooks/cryptomus | Вебхук от Cryptomus |
| GET | /api/profile/me | Мой профиль |
| PUT | /api/profile/me | Обновить профиль |
| GET | /api/profile/:id | Профиль пользователя |
| GET | /api/notifications | Уведомления |
| POST | /api/notifications/read-all | Прочитать все |

## Эскроу-поток

```
Заказчик принимает отклик
    → создаётся deal (status: pending)
    → заказчик оплачивает через CryptoBot/Cryptomus
    → POST /deals/:id/activate
        → lockEscrow() — баланс → frozen
        → deal status: active

Исполнитель выполняет работу

Заказчик подтверждает
    → POST /deals/:id/complete
        → releaseEscrow()
            → frozen → исполнителю (минус комиссия 10%)
        → deal status: completed

Спор
    → POST /deals/:id/dispute
        → deal status: disputed
        → Admin вручную вызывает releaseEscrow() или refundEscrow()

Отмена
    → POST /deals/:id/cancel
        → refundEscrow() — frozen → обратно заказчику
```

## Вебхуки (настройка)

### CryptoBot
В личном кабинете @CryptoBot установить:
```
Webhook URL: https://your-domain.com/api/webhooks/cryptobot
```

### Cryptomus
В настройках merchant установить:
```
Callback URL: https://your-domain.com/api/webhooks/cryptomus
```
