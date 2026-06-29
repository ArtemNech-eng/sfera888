# syntax=docker/dockerfile:1
#
# Render_Environment для пайплайна AI_Design_3D_Blockout (подход B2).
#
# Образ содержит headless Blender + Node/pnpm, чтобы оператор мог запускать
# полный 3D-пайплайн (`run-blockout.ts`) и R&D-прототип (`prototype.ts`):
#   • Blender исполняется как `blender --background --python blockout_builder.py`
#     (Requirement 12.1), рендер карт глубины — движком EEVEE Next (Req 12.2);
#   • TypeScript-оркестратор поднимается через `npx tsx`.
#
# Это offline-инструмент оператора (не сервис). Сборка/запуск:
#
#   docker build -f artifacts/api-server/scripts/blockout/Dockerfile \
#     -t sfera-blockout .
#
#   docker run --rm \
#     -e FAL_API_KEY -e R2_ENDPOINT -e R2_ACCESS_KEY_ID \
#     -e R2_SECRET_ACCESS_KEY -e R2_PUBLIC_URL -e DEFAULT_OBJECT_STORAGE_BUCKET_ID \
#     -e BLENDER_BIN=/usr/local/bin/blender \
#     -v "$PWD/.work:/work" \
#     sfera-blockout \
#     npx tsx artifacts/api-server/scripts/blockout/run-blockout.ts \
#       --room-type living_room --area 24 \
#       --style "скандинавский минимализм, тёплый дневной свет" \
#       --project-id demo-001 --out /work/demo-001
#
# GPU (опционально, ускоряет EEVEE Next): добавьте `--gpus all` к `docker run`
# и используйте базовый образ с CUDA, если доступен GPU-рантайм. EEVEE Next
# работает и на CPU — для лёгкого серого блокаута этого достаточно.

# ─── Базовый образ: Node 22 (совпадает с рантаймом проекта) ────────────────────
FROM node:22-bookworm

# Версия Blender. EEVEE Next доступен начиная с Blender 4.2 (LTS).
ARG BLENDER_VERSION=4.2.3
ARG BLENDER_MAJOR=4.2

# ─── Системные зависимости headless Blender ────────────────────────────────────
# Blender даже в `--background` тянет набор библиотек X/GL/звука. Ставим
# минимально необходимое для headless-рендера в контейнере без дисплея.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl xz-utils ca-certificates \
      libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libgl1 libglu1-mesa \
      libsm6 libxkbcommon0 libxext6 libfreetype6 libtinfo6 \
    && rm -rf /var/lib/apt/lists/*

# ─── Установка Blender из официальных бинарей ──────────────────────────────────
RUN set -eux; \
    arch="$(uname -m)"; \
    case "$arch" in \
      x86_64)  blarch="linux-x64" ;; \
      aarch64) blarch="linux-arm64" ;; \
      *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
    esac; \
    url="https://download.blender.org/release/Blender${BLENDER_MAJOR}/blender-${BLENDER_VERSION}-${blarch}.tar.xz"; \
    curl -fsSL "$url" -o /tmp/blender.tar.xz; \
    mkdir -p /opt/blender; \
    tar -xJf /tmp/blender.tar.xz -C /opt/blender --strip-components=1; \
    rm /tmp/blender.tar.xz; \
    ln -s /opt/blender/blender /usr/local/bin/blender; \
    blender --version

# pnpm через corepack (как в монорепо).
RUN corepack enable

ENV BLENDER_BIN=/usr/local/bin/blender
WORKDIR /repo

# ─── Зависимости монорепо ──────────────────────────────────────────────────────
# Копируем манифесты для кэширования слоя установки, затем исходники.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
# Корневые workspace-пакеты (db/api-zod) нужны api-server'у; копируем целиком,
# чтобы pnpm разрешил workspace:*-зависимости.
COPY . .

RUN pnpm install --frozen-lockfile || pnpm install

# Рабочая директория артефактов по умолчанию (можно примонтировать том).
RUN mkdir -p /work
ENV BLOCKOUT_WORK_DIR=/work

# По умолчанию показываем справку CLI; реальную команду передают в `docker run`.
CMD ["npx", "tsx", "artifacts/api-server/scripts/blockout/run-blockout.ts", "--help"]
