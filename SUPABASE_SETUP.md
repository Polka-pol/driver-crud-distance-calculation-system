# Налаштування Supabase для API

## Крок 1: Отримайте Supabase JWT Secret

1. Перейдіть до вашого Supabase проекту: https://supabase.com/dashboard
2. Виберіть ваш проект
3. Перейдіть до Settings → API
4. Скопіюйте значення "JWT Secret"

## Крок 2: Додайте до .env файлу

Відкрийте `/Users/connex/Desktop/Conex210/api/.env` та додайте:

```env
# SUPABASE CONFIGURATION
SUPABASE_URL=https://syndeneozjmgnpcfusfg.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_JWT_SECRET=your_jwt_secret_here
```

## Крок 3: Перезапустіть API сервер

Після додавання налаштувань перезапустіть ваш PHP сервер.

## Поточна проблема

API повертає 401/403 помилки тому що:
- `SUPABASE_JWT_SECRET` не налаштований
- Backend не може валідувати Supabase JWT токени
- Користувач `vlad.polishuk.biz@gmail.com` успішно авторизований в Supabase, але API його не розпізнає
