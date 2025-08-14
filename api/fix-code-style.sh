#!/bin/bash

echo "🔧 Автоматичне виправлення стилю коду Connex API"
echo "=================================================="

# Перевірка наявності інструментів
if [ ! -f "vendor/bin/phpcbf" ]; then
    echo "❌ PHP Code Beautifier and Fixer не знайдено"
    echo "Запустіть: composer install"
    exit 1
fi

echo "📝 Виправлення стилю коду за допомогою PHPCBF..."
vendor/bin/phpcbf --standard=phpcs.xml src/

if [ $? -eq 0 ]; then
    echo "✅ Стиль коду виправлено успішно!"
else
    echo "⚠️  Деякі проблеми не могли бути виправлені автоматично"
fi

echo ""
echo "🔍 Перевірка залишених проблем..."
vendor/bin/phpcs --standard=phpcs.xml src/

echo ""
echo "📊 Статистика виправлень:"
echo "- Автоматично виправлено: більшість проблем з відступами та пробілами"
echo "- Потребують ручного виправлення: довгі рядки, складні логічні проблеми"
echo ""
echo "💡 Наступні кроки:"
echo "1. Перегляньте залишені помилки вище"
echo "2. Виправте довгі рядки вручну"
echo "3. Запустіть: composer phpstan для перевірки типів"
echo "4. Запустіть: composer phpmd для перевірки якості"
