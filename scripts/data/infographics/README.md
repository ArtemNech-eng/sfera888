# Инфографики дизайн-проектов (для импорта)

Сюда кладём готовые изображения-инфографики (одна картинка = один проект),
которые публикуются как страницы /dizajn через
`scripts/src/import-design-infographic.ts`.

## Имя файла
`{комната}-{стиль}-{площадь}m.jpg`

Примеры:
- `bedroom-japandi-15m.jpg`
- `kitchen-scandinavian-10m.jpg`
- `living_room-modern-20m.jpg`

Поддерживаются `.jpg`, `.png`, `.webp`.

Путь к файлу прописывается в манифесте `scripts/data/design-import.json`
в поле `image`, например: `"image": "./data/infographics/bedroom-japandi-15m.jpg"`.
