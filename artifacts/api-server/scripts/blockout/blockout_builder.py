#!/usr/bin/env python3
"""Blockout_Builder — headless Blender-скрипт пайплайна B2 (AI_Design_3D_Blockout).

Запускается оркестратором так:

    blender --background --python blockout_builder.py -- \
        --scene scene.json --out <work_dir>

Blender передаёт аргументы скрипта ПОСЛЕ разделителя ``--`` (всё до него
относится к самому Blender). CLI здесь это учитывает.

Задача 5.1 реализует парсинг и валидацию ``Scene_Spec`` плюс каркас CLI.
Задача 5.2 добавляет построение оболочки (``build_room_shell``) и расстановку
мебели (``place_furniture``). Задача 5.3 добавляет камеры (``setup_camera_rig``)
и рендер карт глубины (``render_depth_maps``) движком EEVEE Next через
Compositor. Задача 5.4 добавляет экспорт мировых позиций мебели
(``export_positions``) в ``positions.json`` — проверяемый артефакт для
``Geometric_Consistency`` (Req 7.3).

Геометрия оболочки и мебели разнесена на два слоя:
  • чистые помощники (``shell_box_specs``, ``furniture_world_aabb``,
    ``furniture_within_shell`` и т.п.) НЕ зависят от ``bpy`` — их можно
    импортировать и юнит-тестировать вне Blender;
  • функции ``build_room_shell`` / ``place_furniture`` берут эти спецификации
    боксов и материализуют их примитивами ``bpy`` (исполняются ВНУТРИ Blender).

``parse_scene_spec(path)`` — зеркальная проверка ключей и типов канонической
zod-схемы из ``src/lib/blockout/sceneSpec.ts``. При любом нарушении скрипт
завершается ненулевым кодом (``sys.exit``) и печатает в ``stderr`` имя ПЕРВОГО
нарушенного поля точечным путём (например ``room.dimensions.W`` или
``furniture.0.id``) — зеркало ``SceneSpecValidationError`` на стороне TS
(Requirement 4.2, 4.4).

Импорт ``bpy`` защищён, чтобы ``parse_scene_spec`` можно было запускать и
юнит-тестировать вне Blender (где модуль ``bpy`` недоступен).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from typing import Any, Dict, List, Optional, Sequence

# ─── Защищённый импорт bpy ─────────────────────────────────────────────────────
# В среде без Blender модуля ``bpy`` нет. Парсинг/валидация от него не зависят,
# поэтому импорт мягкий: ``BPY_AVAILABLE`` сообщает, доступны ли 3D-операции
# (задачи 5.2–5.4). Сам ``parse_scene_spec`` работает без Blender.
try:  # pragma: no cover - наличие bpy зависит от среды исполнения
    import bpy  # type: ignore

    BPY_AVAILABLE = True
except Exception:  # ImportError вне Blender, либо иные ошибки загрузки модуля
    bpy = None  # type: ignore
    BPY_AVAILABLE = False


# ─── Коды возврата ─────────────────────────────────────────────────────────────

EXIT_OK = 0
EXIT_SCHEMA_VIOLATION = 2
EXIT_USAGE = 3


# ─── Перечисления / литералы (зеркало sceneSpec.ts) ────────────────────────────

ROOM_TYPES = (
    "bedroom",
    "kitchen",
    "bathroom",
    "living_room",
    "hallway",
    "nursery",
    "apartment",
)

WALLS = ("north", "east", "south", "west")

ROTATIONS = (0, 90, 180, 270)

CAMERA_ROLES = ("perspective", "top_ortho", "isometric")

ENGINE_LITERAL = "EEVEE_NEXT"
SCHEMA_VERSION_LITERAL = 1

# Идентификатор движка EEVEE Next в Blender 4.2+ (Req 12.2). В Scene_Spec движок
# обозначен литералом ``"EEVEE_NEXT"``; в Blender он называется
# ``BLENDER_EEVEE_NEXT``.
EEVEE_NEXT_ENGINE = "BLENDER_EEVEE_NEXT"


# ─── Ошибка валидации ──────────────────────────────────────────────────────────


class SceneSpecValidationError(Exception):
    """Нарушение схемы ``Scene_Spec``.

    ``field`` — точечный путь к первому нарушенному полю (зеркало
    ``SceneSpecValidationError.field`` на стороне TS, Requirement 4.4).
    """

    def __init__(self, field: str, message: str) -> None:
        super().__init__(f'Scene_Spec невалиден в поле "{field}": {message}')
        self.field = field


def _join_path(path: Sequence[Any]) -> str:
    """Точечный путь к полю (``furniture.0.id``, ``room.dimensions.W``).

    Зеркало ``joinPath`` в ``sceneSpec.ts``: пустой путь → ``<root>``.
    """
    if not path:
        return "<root>"
    return ".".join(str(p) for p in path)


def _fail(path: Sequence[Any], message: str) -> "SceneSpecValidationError":
    return SceneSpecValidationError(_join_path(path), message)


# ─── Примитивы валидации (зеркало zod) ─────────────────────────────────────────


def _is_real_number(value: Any) -> bool:
    """Число, но НЕ bool. В Python ``bool`` — подкласс ``int``; JSON ``true``/
    ``false`` не должны проходить как числа (зеркало ``z.number()``)."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _check_finite_number(value: Any, path: Sequence[Any]) -> None:
    """``z.number().finite()``: число, не bool, не NaN/Inf."""
    if not _is_real_number(value):
        raise _fail(path, "ожидалось конечное число")
    if not math.isfinite(float(value)):
        raise _fail(path, "число не должно быть NaN или Infinity")


def _check_positive_number(value: Any, path: Sequence[Any]) -> None:
    """``z.number().finite().positive()``."""
    _check_finite_number(value, path)
    if float(value) <= 0:
        raise _fail(path, "число должно быть строго положительным (> 0)")


def _check_non_negative_number(value: Any, path: Sequence[Any]) -> None:
    """``z.number().finite().nonnegative()``."""
    _check_finite_number(value, path)
    if float(value) < 0:
        raise _fail(path, "число должно быть неотрицательным (>= 0)")


def _check_positive_int(value: Any, path: Sequence[Any]) -> None:
    """``z.number().finite().positive().int()`` — целое и > 0."""
    _check_positive_number(value, path)
    if not float(value).is_integer():
        raise _fail(path, "число должно быть целым")


def _check_string(value: Any, path: Sequence[Any], *, min_len: int = 0) -> None:
    if not isinstance(value, str):
        raise _fail(path, "ожидалась строка")
    if len(value) < min_len:
        raise _fail(path, f"строка должна содержать не менее {min_len} символ(ов)")


def _check_boolean(value: Any, path: Sequence[Any]) -> None:
    if not isinstance(value, bool):
        raise _fail(path, "ожидалось булево значение")


def _check_literal(value: Any, expected: Any, path: Sequence[Any]) -> None:
    if value != expected or type(value) is not type(expected):
        raise _fail(path, f"ожидался литерал {expected!r}")


def _check_enum(value: Any, allowed: Sequence[Any], path: Sequence[Any]) -> None:
    if value not in allowed:
        allowed_str = ", ".join(repr(a) for a in allowed)
        raise _fail(path, f"ожидалось одно из: {allowed_str}")


def _check_object(value: Any, path: Sequence[Any]) -> dict:
    """Объект (dict). Массивы/скаляры/None отсекаются."""
    if not isinstance(value, dict):
        raise _fail(path, "ожидался объект")
    return value


def _check_array(value: Any, path: Sequence[Any]) -> list:
    if not isinstance(value, list):
        raise _fail(path, "ожидался массив")
    return value


def _check_no_extra_keys(
    obj: dict, allowed: Sequence[str], path: Sequence[Any]
) -> None:
    """Зеркало ``.strict()`` в zod: лишние ключи запрещены.

    Сообщает о первом (в порядке появления) неизвестном ключе, чтобы имя
    нарушенного поля было детерминированным.
    """
    for key in obj.keys():
        if key not in allowed:
            raise _fail(list(path) + [key], "неизвестный ключ (схема строгая)")


def _check_required_keys(
    obj: dict, required: Sequence[str], path: Sequence[Any]
) -> None:
    for key in required:
        if key not in obj:
            raise _fail(list(path) + [key], "обязательное поле отсутствует")


# ─── Композитные валидаторы (зеркало sceneSpec.ts) ─────────────────────────────


def _validate_vec3(value: Any, path: Sequence[Any]) -> None:
    """``{ x, y, z }`` — конечные числа, strict."""
    obj = _check_object(value, path)
    _check_required_keys(obj, ("x", "y", "z"), path)
    _check_no_extra_keys(obj, ("x", "y", "z"), path)
    _check_finite_number(obj["x"], list(path) + ["x"])
    _check_finite_number(obj["y"], list(path) + ["y"])
    _check_finite_number(obj["z"], list(path) + ["z"])


def _validate_room(value: Any, path: Sequence[Any]) -> None:
    obj = _check_object(value, path)
    _check_required_keys(obj, ("roomType", "areaM2", "dimensions"), path)
    _check_no_extra_keys(obj, ("roomType", "areaM2", "dimensions"), path)

    _check_enum(obj["roomType"], ROOM_TYPES, list(path) + ["roomType"])
    _check_positive_number(obj["areaM2"], list(path) + ["areaM2"])

    dims_path = list(path) + ["dimensions"]
    dims = _check_object(obj["dimensions"], dims_path)
    _check_required_keys(dims, ("W", "L", "H"), dims_path)
    _check_no_extra_keys(dims, ("W", "L", "H"), dims_path)
    _check_positive_number(dims["W"], dims_path + ["W"])
    _check_positive_number(dims["L"], dims_path + ["L"])
    _check_positive_number(dims["H"], dims_path + ["H"])


def _validate_shell(value: Any, path: Sequence[Any]) -> None:
    obj = _check_object(value, path)
    _check_required_keys(obj, ("door", "window"), path)
    _check_no_extra_keys(obj, ("door", "window"), path)

    door_path = list(path) + ["door"]
    door = _check_object(obj["door"], door_path)
    _check_required_keys(door, ("wall", "offsetM", "widthM", "heightM"), door_path)
    _check_no_extra_keys(door, ("wall", "offsetM", "widthM", "heightM"), door_path)
    _check_enum(door["wall"], WALLS, door_path + ["wall"])
    _check_non_negative_number(door["offsetM"], door_path + ["offsetM"])
    _check_positive_number(door["widthM"], door_path + ["widthM"])
    _check_positive_number(door["heightM"], door_path + ["heightM"])

    window_path = list(path) + ["window"]
    window = _check_object(obj["window"], window_path)
    _check_required_keys(
        window, ("wall", "offsetM", "widthM", "heightM", "sillM"), window_path
    )
    _check_no_extra_keys(
        window, ("wall", "offsetM", "widthM", "heightM", "sillM"), window_path
    )
    _check_enum(window["wall"], WALLS, window_path + ["wall"])
    _check_non_negative_number(window["offsetM"], window_path + ["offsetM"])
    _check_positive_number(window["widthM"], window_path + ["widthM"])
    _check_positive_number(window["heightM"], window_path + ["heightM"])
    _check_non_negative_number(window["sillM"], window_path + ["sillM"])


def _validate_furniture_item(value: Any, path: Sequence[Any]) -> None:
    obj = _check_object(value, path)
    allowed = ("id", "kind", "position", "dimensions", "rotationDeg")
    _check_required_keys(obj, allowed, path)
    _check_no_extra_keys(obj, allowed, path)

    _check_string(obj["id"], list(path) + ["id"], min_len=1)
    _check_string(obj["kind"], list(path) + ["kind"], min_len=1)
    _validate_vec3(obj["position"], list(path) + ["position"])

    dims_path = list(path) + ["dimensions"]
    dims = _check_object(obj["dimensions"], dims_path)
    _check_required_keys(dims, ("w", "d", "h"), dims_path)
    _check_no_extra_keys(dims, ("w", "d", "h"), dims_path)
    _check_positive_number(dims["w"], dims_path + ["w"])
    _check_positive_number(dims["d"], dims_path + ["d"])
    _check_positive_number(dims["h"], dims_path + ["h"])

    _check_enum(obj["rotationDeg"], ROTATIONS, list(path) + ["rotationDeg"])


def _validate_furniture(value: Any, path: Sequence[Any]) -> None:
    arr = _check_array(value, path)
    if len(arr) < 1:
        raise _fail(path, "массив furniture должен содержать хотя бы один предмет")
    for index, item in enumerate(arr):
        _validate_furniture_item(item, list(path) + [index])
    # Уникальность id (зеркало superRefine в sceneSpec.ts).
    seen: set = set()
    for index, item in enumerate(arr):
        item_id = item["id"]
        if item_id in seen:
            raise _fail(list(path) + [index, "id"], f'furniture id "{item_id}" не уникален')
        seen.add(item_id)


def _validate_camera_spec(value: Any, path: Sequence[Any]) -> None:
    obj = _check_object(value, path)
    allowed = ("id", "role", "position", "target", "fovDeg", "orthoScale")
    required = ("id", "role", "position", "target")
    _check_required_keys(obj, required, path)
    _check_no_extra_keys(obj, allowed, path)

    _check_string(obj["id"], list(path) + ["id"], min_len=1)
    _check_enum(obj["role"], CAMERA_ROLES, list(path) + ["role"])
    _validate_vec3(obj["position"], list(path) + ["position"])
    _validate_vec3(obj["target"], list(path) + ["target"])
    if "fovDeg" in obj:
        _check_positive_number(obj["fovDeg"], list(path) + ["fovDeg"])
    if "orthoScale" in obj:
        _check_positive_number(obj["orthoScale"], list(path) + ["orthoScale"])


def _validate_camera_rig(value: Any, path: Sequence[Any]) -> None:
    arr = _check_array(value, path)
    # Camera_Rig фиксирован: ровно 6 камер (Req 5.1).
    if len(arr) != 6:
        raise _fail(path, f"cameraRig должен содержать ровно 6 камер, найдено {len(arr)}")
    for index, cam in enumerate(arr):
        _validate_camera_spec(cam, list(path) + [index])
    # Состав: 4 perspective + 1 top_ortho + 1 isometric (зеркало superRefine).
    def count(role: str) -> int:
        return sum(1 for c in arr if c.get("role") == role)

    if count("perspective") != 4:
        raise _fail(
            path,
            f"cameraRig должен содержать ровно 4 perspective-камеры, найдено {count('perspective')}",
        )
    if count("top_ortho") != 1:
        raise _fail(
            path,
            f"cameraRig должен содержать ровно 1 top_ortho-камеру, найдено {count('top_ortho')}",
        )
    if count("isometric") != 1:
        raise _fail(
            path,
            f"cameraRig должен содержать ровно 1 isometric-камеру, найдено {count('isometric')}",
        )


def _validate_render(value: Any, path: Sequence[Any]) -> None:
    obj = _check_object(value, path)
    _check_required_keys(obj, ("engine", "renderNormals", "resolution"), path)
    _check_no_extra_keys(obj, ("engine", "renderNormals", "resolution"), path)

    _check_literal(obj["engine"], ENGINE_LITERAL, list(path) + ["engine"])
    _check_boolean(obj["renderNormals"], list(path) + ["renderNormals"])

    res_path = list(path) + ["resolution"]
    res = _check_object(obj["resolution"], res_path)
    _check_required_keys(res, ("width", "height"), res_path)
    _check_no_extra_keys(res, ("width", "height"), res_path)
    _check_positive_int(res["width"], res_path + ["width"])
    _check_positive_int(res["height"], res_path + ["height"])


def _validate_style(value: Any, path: Sequence[Any]) -> None:
    obj = _check_object(value, path)
    _check_required_keys(obj, ("sharedStylePrompt", "negativePrompt"), path)
    _check_no_extra_keys(obj, ("sharedStylePrompt", "negativePrompt"), path)
    _check_string(obj["sharedStylePrompt"], list(path) + ["sharedStylePrompt"], min_len=1)
    _check_string(obj["negativePrompt"], list(path) + ["negativePrompt"])


def validate_scene_spec(data: Any) -> dict:
    """Валидирует разобранный ``Scene_Spec`` (dict) против схемы.

    Поля проверяются в порядке объявления канонической схемы, чтобы имя
    «первого нарушенного поля» было детерминированным (Req 4.4).

    :raises SceneSpecValidationError: при первом нарушении схемы.
    :return: тот же ``data`` (валидный ``Scene_Spec``).
    """
    obj = _check_object(data, [])
    top_keys = (
        "schemaVersion",
        "room",
        "shell",
        "layoutPresetId",
        "furniture",
        "cameraRig",
        "render",
        "style",
    )
    _check_required_keys(obj, top_keys, [])
    _check_no_extra_keys(obj, top_keys, [])

    _check_literal(obj["schemaVersion"], SCHEMA_VERSION_LITERAL, ["schemaVersion"])
    _validate_room(obj["room"], ["room"])
    _validate_shell(obj["shell"], ["shell"])
    _check_string(obj["layoutPresetId"], ["layoutPresetId"], min_len=1)
    _validate_furniture(obj["furniture"], ["furniture"])
    _validate_camera_rig(obj["cameraRig"], ["cameraRig"])
    _validate_render(obj["render"], ["render"])
    _validate_style(obj["style"], ["style"])

    return obj


def parse_scene_spec(path: str) -> dict:
    """Читает ``scene.json`` по ``path`` и строго валидирует ``Scene_Spec``.

    Зеркало ``parseSceneSpec`` на стороне TS. При нарушении схемы бросает
    ``SceneSpecValidationError`` с именем первого нарушенного поля
    (Requirement 4.2, 4.4). Не зависит от Blender — можно вызывать в юнит-тестах.

    :raises SceneSpecValidationError: невалидный JSON или нарушение схемы.
    :return: валидный ``Scene_Spec`` как dict.
    """
    try:
        with open(path, "r", encoding="utf-8") as fh:
            raw = fh.read()
    except OSError as err:
        raise SceneSpecValidationError("<root>", f"не удалось прочитать файл: {err}")

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as err:
        raise SceneSpecValidationError("<root>", f"невалидный JSON: {err}")

    return validate_scene_spec(data)


# ─── Геометрия оболочки и мебели (чистые помощники, без bpy) ───────────────────
#
# Координатное соглашение блокаута (зеркало layoutPresets.ts / sceneSpec.ts):
#   • начало координат в углу комнаты;
#   • ось X — вдоль ширины W, ось Y — вдоль длины L, ось Z — вверх (H);
#   • интерьер комнаты — параллелепипед [0..W] × [0..L] × [0..H];
#   • стены: north/south идут вдоль X (фиксированный Y = L и Y = 0
#     соответственно), east/west — вдоль Y (фиксированный X = W и X = 0).
#
# Все функции в этом блоке детерминированы и НЕ обращаются к ``bpy``, поэтому
# их можно юнит-тестировать вне Blender. Они возвращают «спеки боксов» —
# словари ``{"name", "center": (x,y,z), "size": (sx,sy,sz)}`` — которые
# ``build_room_shell`` затем материализует примитивными кубами.

# Толщина стен/пола/потолка блокаута (метры). Стены/перекрытия центрируются на
# граничных плоскостях комнаты, поэтому интерьер остаётся ровно [0..W]×[0..L]×[0..H].
DEFAULT_WALL_THICKNESS_M = 0.1

# Допуск при проверке вписывания мебели в границы (компенсирует floating-point).
SHELL_BOUNDS_EPS_M = 1e-6


def _box_spec(name: str, center, size) -> dict:
    """Спецификация осесогласованного бокса (без поворота)."""
    return {
        "name": name,
        "center": (float(center[0]), float(center[1]), float(center[2])),
        "size": (float(size[0]), float(size[1]), float(size[2])),
    }


def wall_length(wall: str, W: float, L: float) -> float:
    """Протяжённость стены (м): north/south идут вдоль W, east/west — вдоль L.

    Зеркало ``wallLength`` в ``sceneSpec.ts``.
    """
    return W if wall in ("north", "south") else L


def opening_u_span(offset_m: float, width_m: float, wall_len: float) -> tuple:
    """Координаты проёма [start, end] вдоль стены, прижатые к её протяжённости.

    Схема гарантирует ``offset_m >= 0`` и ``width_m > 0``, а ``buildSceneSpec``
    держит ``offset + width <= wall_len``; клиппинг здесь — защита от пограничных
    значений, чтобы проём всегда лежал на стене (Req 2.3).
    """
    start = max(0.0, min(float(offset_m), float(wall_len)))
    end = min(float(wall_len), start + float(width_m))
    if end < start:
        end = start
    return (start, end)


def _wall_panel_box(
    name: str,
    wall: str,
    u0: float,
    u1: float,
    z0: float,
    z1: float,
    W: float,
    L: float,
    thickness: float,
) -> dict:
    """Бокс-сегмент стены ``wall`` на u-диапазоне [u0,u1] и высоте [z0,z1].

    ``u`` — координата вдоль стены (X для north/south, Y для east/west). Панель
    центрируется на граничной плоскости комнаты и имеет толщину ``thickness``.
    """
    uc = (u0 + u1) / 2.0
    ul = max(u1 - u0, 0.0)
    zc = (z0 + z1) / 2.0
    zl = max(z1 - z0, 0.0)
    if wall in ("north", "south"):
        y = L if wall == "north" else 0.0
        return _box_spec(name, (uc, y, zc), (ul, thickness, zl))
    # east / west
    x = W if wall == "east" else 0.0
    return _box_spec(name, (x, uc, zc), (thickness, ul, zl))


def _wall_segment_boxes(
    wall: str,
    W: float,
    L: float,
    H: float,
    thickness: float,
    openings: List[dict],
) -> List[dict]:
    """Боксы одной стены с вырезанными проёмами.

    Глухая стена — один панельный бокс на всю протяжённость и высоту. Каждый
    проём задаётся u-диапазоном и высотой [z0,z1]; вокруг него строятся
    полноразмерные «пилоны» (по бокам) и сегменты под/над проёмом, оставляя
    пустоту самого проёма (Req 2.2). Так оболочка получает реальные отверстия
    без булевых операций.
    """
    wlen = wall_length(wall, W, L)
    if not openings:
        return [_wall_panel_box(f"Wall_{wall}", wall, 0.0, wlen, 0.0, H, W, L, thickness)]

    spans = []
    for op in openings:
        s, e = opening_u_span(op["offsetM"], op["widthM"], wlen)
        z0 = max(0.0, min(float(op["z0"]), H))
        z1 = max(z0, min(float(op["z1"]), H))
        spans.append((s, e, z0, z1))
    spans.sort(key=lambda t: t[0])

    boxes: List[dict] = []
    idx = 0
    cursor = 0.0
    for (s, e, z0, z1) in spans:
        if s > cursor:
            boxes.append(
                _wall_panel_box(f"Wall_{wall}_pier{idx}", wall, cursor, s, 0.0, H, W, L, thickness)
            )
            idx += 1
        if z0 > 0.0:  # сегмент под проёмом (подоконная часть для окна)
            boxes.append(
                _wall_panel_box(f"Wall_{wall}_below{idx}", wall, s, e, 0.0, z0, W, L, thickness)
            )
            idx += 1
        if z1 < H:  # перемычка над проёмом
            boxes.append(
                _wall_panel_box(f"Wall_{wall}_above{idx}", wall, s, e, z1, H, W, L, thickness)
            )
            idx += 1
        cursor = max(cursor, e)
    if cursor < wlen:
        boxes.append(
            _wall_panel_box(f"Wall_{wall}_pier{idx}", wall, cursor, wlen, 0.0, H, W, L, thickness)
        )
    return boxes


def _opening_panel_box(
    name: str,
    wall: str,
    W: float,
    L: float,
    H: float,
    thickness: float,
    offset_m: float,
    width_m: float,
    z0: float,
    z1: float,
) -> dict:
    """Тонкая панель, заполняющая проём (полотно двери / стекло окна).

    Тоньше стены и утоплена в плоскость стены — даёт ровно один объект
    «дверь»/«окно» в проёме (Req 2.2: ровно одно окно и одна дверь).
    """
    wlen = wall_length(wall, W, L)
    s, e = opening_u_span(offset_m, width_m, wlen)
    panel_thickness = thickness * 0.3
    z0c = max(0.0, min(float(z0), H))
    z1c = max(z0c, min(float(z1), H))
    return _wall_panel_box(name, wall, s, e, z0c, z1c, W, L, panel_thickness)


def shell_box_specs(spec: dict, thickness: float = DEFAULT_WALL_THICKNESS_M) -> List[dict]:
    """Полный набор боксов ``Room_Shell``: пол, потолок, 4 стены, дверь, окно.

    Чистая функция (без ``bpy``): строит спецификации из габаритов W×L×H и
    позиций ``shell`` (Req 2.2, 2.3). Гарантирует положительные W/L/H (Req 2.4)
    — иначе ``ValueError``.
    """
    dims = spec["room"]["dimensions"]
    W, L, H = float(dims["W"]), float(dims["L"]), float(dims["H"])
    if not (W > 0.0 and L > 0.0 and H > 0.0):
        raise ValueError(
            f"build_room_shell: габариты комнаты должны быть положительными, "
            f"получено W={W}, L={L}, H={H}"
        )

    shell = spec["shell"]
    door = shell["door"]
    window = shell["window"]

    boxes: List[dict] = []
    # Пол: верхняя грань на z=0; потолок: нижняя грань на z=H.
    boxes.append(_box_spec("Floor", (W / 2.0, L / 2.0, -thickness / 2.0), (W, L, thickness)))
    boxes.append(_box_spec("Ceiling", (W / 2.0, L / 2.0, H + thickness / 2.0), (W, L, thickness)))

    # Проёмы по стенам (дверь от пола; окно от подоконника).
    door_z1 = min(H, float(door["heightM"]))
    win_z0 = min(float(window["sillM"]), H)
    win_z1 = min(H, win_z0 + float(window["heightM"]))

    openings_by_wall: dict = {}
    openings_by_wall.setdefault(door["wall"], []).append(
        {"offsetM": door["offsetM"], "widthM": door["widthM"], "z0": 0.0, "z1": door_z1}
    )
    openings_by_wall.setdefault(window["wall"], []).append(
        {"offsetM": window["offsetM"], "widthM": window["widthM"], "z0": win_z0, "z1": win_z1}
    )

    for wall in WALLS:
        boxes.extend(
            _wall_segment_boxes(wall, W, L, H, thickness, openings_by_wall.get(wall, []))
        )

    # Ровно один объект двери и один объект окна в своих проёмах (Req 2.2).
    boxes.append(
        _opening_panel_box(
            "Door", door["wall"], W, L, H, thickness, door["offsetM"], door["widthM"], 0.0, door_z1
        )
    )
    boxes.append(
        _opening_panel_box(
            "Window", window["wall"], W, L, H, thickness, window["offsetM"], window["widthM"], win_z0, win_z1
        )
    )
    return boxes


def furniture_world_aabb(item: dict) -> tuple:
    """AABB предмета мебели в мировых координатах с учётом поворота вокруг Z.

    Возвращает ``(minX, maxX, minY, maxY, minZ, maxZ)``. Повороты 90/270
    меняют местами ширину и глубину в плане (зеркало ``rotatedHalfExtents`` в
    ``sceneSpec.ts``).
    """
    dims = item["dimensions"]
    w, d, h = float(dims["w"]), float(dims["d"]), float(dims["h"])
    swapped = int(item["rotationDeg"]) in (90, 270)
    hx = (d if swapped else w) / 2.0
    hy = (w if swapped else d) / 2.0
    hz = h / 2.0
    pos = item["position"]
    cx, cy, cz = float(pos["x"]), float(pos["y"]), float(pos["z"])
    return (cx - hx, cx + hx, cy - hy, cy + hy, cz - hz, cz + hz)


def furniture_within_shell(
    item: dict, W: float, L: float, H: float, eps: float = SHELL_BOUNDS_EPS_M
) -> bool:
    """Проверяет, что AABB предмета целиком в границах ``[0..W]×[0..L]×[0..H]``.

    Зеркало геометрии Property 8 / Requirement 3.4 на стороне Python.
    """
    min_x, max_x, min_y, max_y, min_z, max_z = furniture_world_aabb(item)
    return (
        min_x >= -eps
        and max_x <= W + eps
        and min_y >= -eps
        and max_y <= L + eps
        and min_z >= -eps
        and max_z <= H + eps
    )


def validate_furniture_within_shell(spec: dict) -> None:
    """Бросает ``ValueError``, если любой предмет мебели выходит за границы.

    Чистая проверка (без ``bpy``), используется ``place_furniture`` и доступна
    в юнит-тестах (Req 3.4).
    """
    dims = spec["room"]["dimensions"]
    W, L, H = float(dims["W"]), float(dims["L"]), float(dims["H"])
    for item in spec["furniture"]:
        if not furniture_within_shell(item, W, L, H):
            aabb = furniture_world_aabb(item)
            raise ValueError(
                f"place_furniture: предмет '{item['id']}' выходит за границы "
                f"Room_Shell [0..{W}]×[0..{L}]×[0..{H}] (AABB={aabb})"
            )


# ─── Материализация примитивов в Blender (требует bpy) ─────────────────────────


def _require_bpy(fn_name: str) -> None:
    if not BPY_AVAILABLE:
        raise RuntimeError(
            f"{fn_name}: bpy недоступен — функция должна выполняться внутри "
            f"Blender (blender --background --python ...)."
        )


def _create_primitive_box(
    name: str, center, size, rotation_z_deg: float = 0.0
):  # pragma: no cover - требует Blender
    """Создаёт серый примитив-куб без материалов и текстур (Req 3.2).

    Единичный куб масштабируется до ``size`` и ставится в ``center``; поворот —
    только вокруг оси Z. Материалы намеренно не назначаются: блокаут остаётся
    «серым» gray-box (Req 3.2).
    """
    _require_bpy("_create_primitive_box")
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(center[0], center[1], center[2]))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    if rotation_z_deg:
        obj.rotation_euler = (0.0, 0.0, math.radians(float(rotation_z_deg)))
    # Никаких материалов/текстур — оставляем меш «голым» (Req 3.2).
    obj.data.materials.clear()
    return obj


def build_room_shell(spec: dict):  # pragma: no cover - требует Blender
    """Строит ``Room_Shell``: 4 стены, пол, потолок, ровно одно окно и одна дверь.

    Габариты W×L×H и позиции проёмов берутся из ``Scene_Spec`` (Req 2.2, 2.3);
    положительность W/L/H гарантируется (Req 2.4). Геометрия вычисляется чистой
    ``shell_box_specs`` и материализуется примитивами без материалов.

    :return: список созданных объектов Blender.
    """
    _require_bpy("build_room_shell")
    boxes = shell_box_specs(spec)
    return [_create_primitive_box(b["name"], b["center"], b["size"]) for b in boxes]


def place_furniture(spec: dict):  # pragma: no cover - требует Blender
    """Инстанцирует мебель ``Layout_Preset` примитивами без материалов (Req 3.1–3.3).

    Перед созданием проверяет, что каждый предмет целиком внутри границ
    ``Room_Shell`` (Req 3.4) — иначе ``ValueError`` с именем предмета. Позиции,
    габариты и ориентация берутся из мировых координат ``Scene_Spec``.

    :return: список созданных объектов Blender.
    """
    _require_bpy("place_furniture")
    validate_furniture_within_shell(spec)
    objs = []
    for item in spec["furniture"]:
        dims = item["dimensions"]
        pos = item["position"]
        obj = _create_primitive_box(
            f"Furniture_{item['id']}",
            (float(pos["x"]), float(pos["y"]), float(pos["z"])),
            (float(dims["w"]), float(dims["d"]), float(dims["h"])),
            rotation_z_deg=float(item["rotationDeg"]),
        )
        objs.append(obj)
    return objs


# ─── Камеры и рендер карт глубины (задача 5.3) ─────────────────────────────────
#
# Слой разнесён так же, как геометрия оболочки:
#   • чистые помощники (``camera_data_type``, ``depth_map_filename``,
#     ``normal_map_filename``, ``render_output_plan``) НЕ зависят от ``bpy`` —
#     задают именование артефактов и план вывода, импортируются/тестируются вне
#     Blender;
#   • ``setup_camera_rig`` / ``render_depth_maps`` материализуют камеры и
#     запускают рендер средствами ``bpy`` (исполняются ВНУТРИ Blender).

# Префиксы канонических имён артефактов рендера. Итоговые файлы ключуются по id
# камеры: ``depth_<camera_id>.png`` и (опц.) ``normal_<camera_id>.png``.
DEPTH_MAP_PREFIX = "depth"
NORMAL_MAP_PREFIX = "normal"


def camera_data_type(role: str) -> str:
    """Тип данных Blender-камеры по роли ``Camera_Rig``.

    ``perspective`` → перспективная (``PERSP``); ``top_ortho`` и ``isometric`` →
    ортографические (``ORTHO``). Чистый помощник (без ``bpy``).
    """
    return "PERSP" if role == "perspective" else "ORTHO"


def depth_map_filename(camera_id: str) -> str:
    """Каноническое имя файла ``Depth_Map`` для камеры (ключуется по id)."""
    return f"{DEPTH_MAP_PREFIX}_{camera_id}.png"


def normal_map_filename(camera_id: str) -> str:
    """Каноническое имя файла ``Normal_Map`` для камеры (ключуется по id)."""
    return f"{NORMAL_MAP_PREFIX}_{camera_id}.png"


def render_output_plan(spec: dict) -> Dict[str, Dict[str, Optional[str]]]:
    """План вывода ``Depth_Render_Step``: одна ``Depth_Map`` на камеру, и —
    при ``render.renderNormals`` — одна ``Normal_Map`` на камеру (Req 5.2, 5.3).

    Чистая функция (без ``bpy``): возвращает словарь
    ``{camera_id: {"depth": <имя>, "normal": <имя>|None}}``. Зеркалит свойство
    «число карт равно числу камер», проверяемое smoke-тестом задачи 5.5.
    """
    render_normals = bool(spec["render"]["renderNormals"])
    plan: Dict[str, Dict[str, Optional[str]]] = {}
    for cam in spec["cameraRig"]:
        cid = cam["id"]
        if cid in plan:
            raise ValueError(f"render_output_plan: id камеры '{cid}' не уникален")
        plan[cid] = {
            "depth": depth_map_filename(cid),
            "normal": normal_map_filename(cid) if render_normals else None,
        }
    return plan


def _camera_object_name(camera_id: str) -> str:
    """Имя объекта Blender-камеры по id из ``Scene_Spec``."""
    return f"Camera_{camera_id}"


def setup_camera_rig(spec: dict):  # pragma: no cover - требует Blender
    """Создаёт камеры ``Camera_Rig`` из ``spec['cameraRig']`` (Req 5.1).

    Перспективные камеры получают угол обзора из ``fovDeg``; ``top_ortho`` и
    ``isometric`` — ортографические с масштабом ``orthoScale``. Каждая камера
    ставится в ``position`` и нацеливается на ``target`` (направление ``-Z``
    камеры смотрит на цель, ``Y`` — вверх). Объекты именуются ``Camera_<id>``,
    чтобы ``render_depth_maps`` мог сопоставить их с записями ``Scene_Spec``.

    :return: список созданных объектов камер (по одному на запись ``cameraRig``).
    """
    _require_bpy("setup_camera_rig")
    from mathutils import Vector  # доступен только внутри Blender

    cameras = []
    for cam in spec["cameraRig"]:
        cid = cam["id"]
        role = cam["role"]
        cam_data = bpy.data.cameras.new(name=f"CamData_{cid}")
        cam_data.type = camera_data_type(role)
        if cam_data.type == "PERSP":
            fov_deg = cam.get("fovDeg")
            if fov_deg is not None:
                cam_data.lens_unit = "FOV"
                cam_data.angle = math.radians(float(fov_deg))
        else:  # ORTHO (top_ortho / isometric)
            ortho_scale = cam.get("orthoScale")
            if ortho_scale is not None:
                cam_data.ortho_scale = float(ortho_scale)

        cam_obj = bpy.data.objects.new(name=_camera_object_name(cid), object_data=cam_data)
        bpy.context.scene.collection.objects.link(cam_obj)

        pos = cam["position"]
        tgt = cam["target"]
        cam_obj.location = (float(pos["x"]), float(pos["y"]), float(pos["z"]))

        # Нацеливание: камера Blender смотрит вдоль локальной оси -Z, верх — +Y.
        direction = Vector(
            (
                float(tgt["x"]) - float(pos["x"]),
                float(tgt["y"]) - float(pos["y"]),
                float(tgt["z"]) - float(pos["z"]),
            )
        )
        if direction.length > 0.0:
            cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

        cameras.append(cam_obj)
    return cameras


def _setup_depth_compositor(scene, render_normals: bool):  # pragma: no cover - требует Blender
    """Строит граф композитора ``Render Layers → Normalize → File Output`` для
    Z/Depth-прохода (и Normal-прохода при ``render_normals``) — основа
    ``Depth_Render_Step`` (Req 12.2).

    Возвращает ``(depth_output_node, normal_output_node | None)``. Узлы File
    Output переиспользуются для всех камер: ``render_depth_maps`` лишь меняет
    ``base_path`` и путь слота перед каждым рендером.
    """
    view_layer = scene.view_layers[0]
    view_layer.use_pass_z = True
    if render_normals:
        view_layer.use_pass_normal = True

    scene.use_nodes = True
    tree = scene.node_tree
    tree.nodes.clear()

    render_layers = tree.nodes.new("CompositorNodeRLayers")

    # Depth: Render Layers (Depth) → Normalize → File Output (PNG).
    depth_normalize = tree.nodes.new("CompositorNodeNormalize")
    tree.links.new(render_layers.outputs["Depth"], depth_normalize.inputs[0])
    depth_output = tree.nodes.new("CompositorNodeOutputFile")
    depth_output.format.file_format = "PNG"
    tree.links.new(depth_normalize.outputs[0], depth_output.inputs[0])

    normal_output = None
    if render_normals:
        normal_output = tree.nodes.new("CompositorNodeOutputFile")
        normal_output.format.file_format = "PNG"
        tree.links.new(render_layers.outputs["Normal"], normal_output.inputs[0])

    return depth_output, normal_output


def _finalize_render_file(out_dir: str, slot_prefix: str, final_path: str) -> None:  # pragma: no cover - требует Blender
    """Переименовывает файл, записанный узлом File Output, в каноническое имя.

    Узел File Output дописывает номер кадра к пути слота (например
    ``_depth_camA_0001.png``). Находим записанный файл по префиксу слота и
    переименовываем в ``final_path`` (``depth_<id>.png`` / ``normal_<id>.png``).
    """
    candidates = sorted(
        name
        for name in os.listdir(out_dir)
        if name.startswith(slot_prefix) and name.lower().endswith(".png")
    )
    if not candidates:
        raise RuntimeError(
            f"render_depth_maps: ожидался выходной файл с префиксом "
            f"'{slot_prefix}' в каталоге {out_dir}, но он не найден"
        )
    produced = os.path.join(out_dir, candidates[-1])
    if os.path.exists(final_path):
        os.remove(final_path)
    os.replace(produced, final_path)


def render_depth_maps(spec: dict, out: str):  # pragma: no cover - требует Blender
    """``Depth_Render_Step``: рендерит ровно одну ``Depth_Map`` на каждую камеру
    ``Camera_Rig`` движком EEVEE Next; при ``render.renderNormals`` — ещё и одну
    ``Normal_Map`` на камеру (Req 5.2, 5.3, 12.2).

    Глубина берётся из Z/Depth-прохода через Compositor (Render Layers →
    Normalize → File Output). Камеры должны быть созданы заранее
    ``setup_camera_rig(spec)`` (объекты ``Camera_<id>``). Итоговые файлы
    ключуются по id камеры (``depth_<id>.png`` / ``normal_<id>.png``).

    :return: словарь ``{camera_id: {"depth": <путь>, "normal": <путь>|None}}``.
    """
    _require_bpy("render_depth_maps")
    os.makedirs(out, exist_ok=True)

    scene = bpy.context.scene
    scene.render.engine = EEVEE_NEXT_ENGINE  # EEVEE Next (Req 12.2)

    res = spec["render"]["resolution"]
    scene.render.resolution_x = int(res["width"])
    scene.render.resolution_y = int(res["height"])
    scene.render.resolution_percentage = 100

    render_normals = bool(spec["render"]["renderNormals"])
    depth_output, normal_output = _setup_depth_compositor(scene, render_normals)
    plan = render_output_plan(spec)

    written: Dict[str, Dict[str, Optional[str]]] = {}
    for cam in spec["cameraRig"]:
        cid = cam["id"]
        cam_obj = bpy.data.objects.get(_camera_object_name(cid))
        if cam_obj is None:
            raise RuntimeError(
                f"render_depth_maps: камера '{_camera_object_name(cid)}' не найдена; "
                f"вызовите setup_camera_rig(spec) до рендера"
            )
        scene.camera = cam_obj

        depth_slot = f"_depth_{cid}_"
        depth_output.base_path = out
        depth_output.file_slots[0].path = depth_slot

        if normal_output is not None:
            normal_slot = f"_normal_{cid}_"
            normal_output.base_path = out
            normal_output.file_slots[0].path = normal_slot

        # Рендерим сцену: узлы File Output пишут карты через Compositor.
        bpy.ops.render.render(write_still=False)

        depth_final = os.path.join(out, plan[cid]["depth"])
        _finalize_render_file(out, depth_slot, depth_final)
        written.setdefault(cid, {})["depth"] = depth_final

        if normal_output is not None:
            normal_final = os.path.join(out, plan[cid]["normal"])
            _finalize_render_file(out, normal_slot, normal_final)
            written[cid]["normal"] = normal_final
        else:
            written.setdefault(cid, {})["normal"] = None

    return written


# ─── Экспорт мировых позиций мебели (задача 5.4) ───────────────────────────────
#
# Каноническая форма positions.json (зеркало src/lib/blockout/positions.ts,
# тип PositionsExport): { sceneId?, furniture: [{ id, position{x,y,z},
# dimensions{w,d,h}, rotationDeg }] }. Это ПРОВЕРЯЕМЫЙ артефакт для
# Geometric_Consistency (Req 7.3): ровно одна запись на каждый предмет мебели
# Scene_Spec, со значениями позиции/габаритов/ориентации прямо из Scene_Spec.
#
# Экспорт — чистая запись данных (json.dump): bpy не нужен. Делается один раз на
# сцену (НЕ на камеру) — множество позиций берётся из единственного
# Room_Blockout и не зависит от камеры (Req 7.2, 7.4).

# Каноническое имя файла экспорта позиций.
POSITIONS_FILENAME = "positions.json"


def build_positions_export(spec: dict, scene_id: Optional[str] = None) -> dict:
    """Строит канонический экспорт позиций мебели из ``Scene_Spec``.

    Зеркало ``buildPositionsExport`` на стороне TS (``positions.ts``). Результат
    содержит ровно одну запись на каждый предмет ``spec['furniture']`` (по
    ``id``), со значениями ``position`` / ``dimensions`` / ``rotationDeg`` прямо
    из ``Scene_Spec``; порядок предметов сохраняется (Property 12, Req 7.3).
    Поля копируются в новые объекты, чтобы экспорт не разделял ссылок со спеком.

    ``sceneId`` добавляется в результат только если задан (зеркало
    необязательного поля ``sceneId`` в TS).
    """
    furniture: List[dict] = []
    for item in spec["furniture"]:
        pos = item["position"]
        dims = item["dimensions"]
        furniture.append(
            {
                "id": item["id"],
                "position": {
                    "x": float(pos["x"]),
                    "y": float(pos["y"]),
                    "z": float(pos["z"]),
                },
                "dimensions": {
                    "w": float(dims["w"]),
                    "d": float(dims["d"]),
                    "h": float(dims["h"]),
                },
                "rotationDeg": int(item["rotationDeg"]),
            }
        )

    result: dict = {"furniture": furniture}
    if scene_id is not None:
        result["sceneId"] = scene_id
    return result


def export_positions(spec: dict, out: str, scene_id: Optional[str] = None) -> str:
    """Пишет ``positions.json`` в каталог ``out`` (один раз на сцену, Req 7.3).

    Чистая запись данных — Blender не требуется. Содержимое строится
    ``build_positions_export`` (по одной записи на предмет мебели с мировыми
    позициями/габаритами/ориентацией). Возвращает путь к записанному файлу.

    :return: абсолютный/относительный путь к ``positions.json``.
    """
    os.makedirs(out, exist_ok=True)
    export = build_positions_export(spec, scene_id)
    path = os.path.join(out, POSITIONS_FILENAME)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(export, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    return path


# ─── CLI ───────────────────────────────────────────────────────────────────────


def _script_args(argv: Sequence[str]) -> List[str]:
    """Аргументы скрипта после разделителя ``--`` (как их передаёт Blender).

    Если ``--`` нет (например, запуск как ``python blockout_builder.py ...``),
    берём все аргументы после имени скрипта.
    """
    argv = list(argv)
    if "--" in argv:
        return argv[argv.index("--") + 1 :]
    return argv[1:]


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="blockout_builder.py",
        description=(
            "Blockout_Builder: парсит Scene_Spec, строит Room_Shell, "
            "расставляет мебель, рендерит Depth_Map и экспортирует "
            "positions.json в headless Blender."
        ),
    )
    parser.add_argument(
        "--scene",
        required=True,
        metavar="scene.json",
        help="путь к JSON-файлу Scene_Spec",
    )
    parser.add_argument(
        "--out",
        required=True,
        metavar="work_dir",
        help="рабочая директория для артефактов (Depth_Map, positions.json)",
    )
    return parser


def main(argv: Sequence[str] = tuple(sys.argv)) -> int:
    """Точка входа CLI. Возвращает код возврата процесса.

    Задача 5.1: парсит аргументы, читает и валидирует ``Scene_Spec``. При
    нарушении схемы печатает имя первого нарушенного поля в ``stderr`` и
    завершается ненулевым кодом (Req 4.4). Построение/расстановка (5.2),
    камеры/рендер (5.3) выполняются внутри Blender; экспорт позиций (5.4) —
    в любой среде (чистая запись данных).
    """
    parser = _build_arg_parser()
    try:
        args = parser.parse_args(_script_args(argv))
    except SystemExit as err:
        # argparse уже напечатал сообщение об использовании в stderr.
        return int(err.code) if isinstance(err.code, int) else EXIT_USAGE

    try:
        spec = parse_scene_spec(args.scene)
    except SceneSpecValidationError as err:
        # Имя первого нарушенного поля — в stderr (Req 4.4).
        print(err.field, file=sys.stderr)
        print(str(err), file=sys.stderr)
        return EXIT_SCHEMA_VIOLATION

    room_type = spec["room"]["roomType"]
    num_furniture = len(spec["furniture"])
    num_cameras = len(spec["cameraRig"])
    print(
        f"Scene_Spec OK: roomType={room_type}, furniture={num_furniture}, "
        f"cameras={num_cameras}, out={args.out}"
    )

    # Задача 5.2: построение оболочки и расстановка мебели. Геометрия чистая и
    # всегда валидируется (включая вписывание мебели в Room_Shell, Req 3.4);
    # материализация примитивов выполняется только внутри Blender.
    try:
        shell_boxes = shell_box_specs(spec)
        validate_furniture_within_shell(spec)
    except (ValueError, KeyError) as err:
        print(f"build_room_shell/place_furniture: {err}", file=sys.stderr)
        return EXIT_SCHEMA_VIOLATION

    if BPY_AVAILABLE:
        shell_objs = build_room_shell(spec)
        furniture_objs = place_furniture(spec)
        print(
            f"Room_Blockout построен: shell_objects={len(shell_objs)}, "
            f"furniture_objects={len(furniture_objs)}"
        )
        # Задача 5.3: камеры Camera_Rig + рендер карт глубины (EEVEE Next).
        cameras = setup_camera_rig(spec)
        rendered = render_depth_maps(spec, args.out)
        normals_suffix = " (+Normal_Map)" if spec["render"]["renderNormals"] else ""
        print(
            f"Camera_Rig создан: cameras={len(cameras)}; "
            f"Depth_Map отрендерены для {len(rendered)} камер{normals_suffix}"
        )
        # Задача 5.4: экспорт мировых позиций мебели (один раз на сцену, Req 7.3).
        positions_path = export_positions(spec, args.out)
        print(f"positions.json записан: {positions_path}")
    else:
        render_plan = render_output_plan(spec)
        num_depth = len(render_plan)
        num_normal = sum(1 for v in render_plan.values() if v["normal"] is not None)
        print(
            f"Геометрия оболочки валидна: shell_box_specs={len(shell_boxes)}, "
            f"furniture в границах Room_Shell."
        )
        print(
            f"План рендера: Depth_Map={num_depth} (по числу камер), "
            f"Normal_Map={num_normal}."
        )
        # Задача 5.4: экспорт позиций — чистая запись данных, bpy не нужен,
        # поэтому выполняется и в ветке без Blender (Req 7.3).
        positions_path = export_positions(spec, args.out)
        print(f"positions.json записан: {positions_path}")
        print(
            "Внимание: bpy недоступен — материализация примитивов, камеры и "
            "рендер пропущены (нужен запуск внутри Blender).",
            file=sys.stderr,
        )

    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
