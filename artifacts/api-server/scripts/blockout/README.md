# AI_Design_3D_Blockout (подход B2) — запуск

Offline-инструмент оператора: фиксирует геометрию комнаты лёгким серым 3D-блокаутом
в headless Blender, рендерит карты глубины и перекрашивает их depth-ControlNet на
fal с единым стилевым промптом. Результат подаётся в существующий
`infographicComposer.ts` без изменения контракта. 2D-путь
(`src/scripts/generate-design-board.ts`) сохраняется как `Fallback_2D_Path`.

## Переменные окружения

| Переменная | Назначение |
|------------|------------|
| `FAL_API_KEY` | ключ fal (перекраска depth-ControlNet) |
| `FAL_MODEL_DEPTH_CONTROLNET` | опц., модель (default `fal-ai/flux-control-lora-depth/image-to-image`) |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL`, `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | доступ к R2 (`Object_Storage`) |
| `BLENDER_BIN` | путь к бинарю Blender (иначе ищется `blender` в `PATH`) |
| `DESIGN_COST_BUDGET_KOPEKS` | опц., верхняя граница `Cost_Budget` (default 6000 = $0.6) |
| `DATABASE_URL` + `RAILWAY_*` | только для публикации `SEO_Page` (шаг пропускается без них) |

## 1. R&D-прототип (сначала — снять главный риск)

Доказывает, что depth-ControlNet удерживает расстановку, ДО постройки полного
пайплайна. Работает от заранее подготовленных карт глубины (4 шт.):

```bash
npx tsx artifacts/api-server/scripts/blockout/prototype.ts \
  --project-id proto-001 \
  --style "скандинавский минимализм, тёплый дневной свет" \
  --depth ./depth/cam1.png --depth ./depth/cam2.png \
  --depth ./depth/cam3.png --depth ./depth/cam4.png \
  --compare
```

`--compare` дополнительно сохранит 2D-вариант для визуального сравнения удержания
геометрии. Выводит публичные URL входов и результатов + суммарную стоимость.

## 2. Полный пайплайн

```bash
npx tsx artifacts/api-server/scripts/blockout/run-blockout.ts \
  --room-type living_room --area 24 \
  --style "скандинавский минимализм, тёплый дневной свет" \
  --project-id demo-001 --out ./.work/demo-001 \
  [--negative "люди, текст"] [--aspect 4:3] [--publish]
```

Шаги: `buildSceneSpec` → `scene.json` → Blender (`blockout_builder.py`) →
загрузка карт глубины в R2 → перекраска по камерам → сборка борда композитором →
загрузка борда в R2 → (опц.) публикация SEO-страницы. `--publish` срабатывает
только в окружении Railway с доступной БД; иначе шаг пропускается, а
`boardPublicUrl` остаётся в выводе для повторной публикации.

## 3. Render_Environment через Docker (headless Blender)

См. `Dockerfile` рядом. Сборка и запуск:

```bash
docker build -f artifacts/api-server/scripts/blockout/Dockerfile -t sfera-blockout .

docker run --rm \
  -e FAL_API_KEY -e R2_ENDPOINT -e R2_ACCESS_KEY_ID -e R2_SECRET_ACCESS_KEY \
  -e R2_PUBLIC_URL -e DEFAULT_OBJECT_STORAGE_BUCKET_ID \
  -v "$PWD/.work:/work" \
  sfera-blockout \
  npx tsx artifacts/api-server/scripts/blockout/run-blockout.ts \
    --room-type living_room --area 24 --style "..." \
    --project-id demo-001 --out /work/demo-001
```

GPU опционален (`--gpus all`); EEVEE Next работает и на CPU для лёгкого блокаута.

## 4. Тесты

```bash
# property + unit тесты фичи (без сети/Blender — мокаются)
npx tsx --test ./__tests__/blockout/*.test.ts
npx tsx --test ./__tests__/dizajn/*.property.test.ts

# smoke-тест рендера запустится при заданном BLENDER_BIN, иначе пропустится:
BLENDER_BIN=/path/to/blender npx tsx --test \
  ./__tests__/blockout/blockout-builder-render.smoke.test.ts

# интеграционный тест прототипа — при заданных FAL_API_KEY + R2:
npx tsx --test ./__tests__/blockout/prototype.integration.test.ts
```

Текущий статус: все unit/property-тесты зелёные; интеграционные (`5.5`, `14.2`)
самопропускаются без Blender / живых кредов и отрабатывают полностью в
оснащённом окружении.
