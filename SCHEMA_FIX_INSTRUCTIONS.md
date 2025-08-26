# КРИТИЧНО: Виправлення схеми бази даних для Supabase-користувачів

## Проблема
Колонки `user_id` в таблицях `activity_logs` і `distance_log` мають обмеження `NOT NULL`, що не дозволяє створювати записи для Supabase-користувачів (які мають тільки UUID, а не числовий MySQL ID).

## Помилки в логах
```
SQLSTATE[23000]: Integrity constraint violation: 1048 Column 'user_id' cannot be null
```

## НЕГАЙНЕ ВИПРАВЛЕННЯ

Виконайте цей SQL скрипт в базі даних:

```sql
-- Дозволити NULL для user_id в activity_logs
ALTER TABLE activity_logs 
MODIFY COLUMN user_id INT NULL;

-- Дозволити NULL для user_id в distance_log  
ALTER TABLE distance_log 
MODIFY COLUMN user_id INT NULL;

-- Перевірити зміни
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    IS_NULLABLE,
    DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME IN ('activity_logs', 'distance_log')
  AND COLUMN_NAME = 'user_id';
```

## Тест після виправлення
```sql
-- Тестовий запис для Supabase-користувача
INSERT INTO activity_logs (user_id, supabase_user_id, action, details, created_at) 
VALUES (NULL, '550e8400-e29b-41d4-a716-446655440000', 'test_supabase_user', '{"test": true}', NOW());

-- Перевірити, що запис створився
SELECT * FROM activity_logs WHERE supabase_user_id IS NOT NULL AND user_id IS NULL;
```

## Після виправлення схеми
Логування буде працювати:
- **Supabase-користувачі**: `user_id` = NULL, `supabase_user_id` = UUID
- **MySQL користувачі**: `user_id` = числовий ID, `supabase_user_id` = NULL

Виконайте цей скрипт ЗАРАЗ, щоб виправити проблему з логуванням.
