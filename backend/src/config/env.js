import 'dotenv/config'

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,

  cryptobot: {
    apiToken: process.env.CRYPTOBOT_API_TOKEN,
    apiUrl: process.env.CRYPTOBOT_API_URL || 'https://pay.crypt.bot/api',
  },

  platformCommission: parseFloat(process.env.PLATFORM_COMMISSION || '10'),
  backendUrl:  process.env.BACKEND_URL  || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || 'https://microcreative-extract.vercel.app',
  adminTelegramId: process.env.ADMIN_TELEGRAM_ID || null,
}

// Проверяем обязательные переменные
const required = ['DATABASE_URL', 'TELEGRAM_BOT_TOKEN']
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env variable: ${key}`)
    process.exit(1)
  }
}
