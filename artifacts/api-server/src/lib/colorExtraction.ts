/**
 * Извлечение доминантной цветовой палитры из сгенерированного render'а.
 * Используется для блока «Цветовая палитра» в дизайн-проекте (4-5 swatches).
 *
 * Алгоритм:
 *   1. Resize image до 64×64 через sharp.
 *   2. Считываем raw RGB пиксели.
 *   3. K-means clustering до 5 кластеров (медиана-cut более точный, но
 *      k-means проще, без зависимостей).
 *   4. Сортируем кластеры по размеру, возвращаем топ-N hex-цветов.
 *
 * Время: ~50-100ms на изображение. Cost: $0.
 */

import sharp from "sharp";
import type { DesignColorSwatch } from "@workspace/db";

export async function extractPalette(
  imageBuffer: Buffer,
  numColors = 5,
): Promise<DesignColorSwatch[]> {
  // 1. Сжимаем картинку для быстрого clustering'a.
  const { data, info } = await sharp(imageBuffer)
    .resize(64, 64, { fit: "cover" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // info.channels = 3 (RGB) или 4 (RGBA).
  const channels = info.channels;
  const pixels: Array<[number, number, number]> = [];
  for (let i = 0; i < data.length; i += channels) {
    pixels.push([data[i]!, data[i + 1]!, data[i + 2]!]);
  }

  // 2. K-means clustering (10 итераций, фиксированные начальные центроиды
  // взятые из равномерной выборки).
  let centroids: Array<[number, number, number]> = [];
  const step = Math.floor(pixels.length / numColors);
  for (let k = 0; k < numColors; k++) {
    centroids.push(pixels[k * step]!);
  }

  for (let iter = 0; iter < 12; iter++) {
    // Назначаем каждый пиксель к ближайшему центроиду.
    const buckets: Array<Array<[number, number, number]>> = Array.from(
      { length: numColors },
      () => [],
    );
    for (const px of pixels) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let k = 0; k < numColors; k++) {
        const c = centroids[k]!;
        const d =
          (px[0] - c[0]) ** 2 + (px[1] - c[1]) ** 2 + (px[2] - c[2]) ** 2;
        if (d < bestDist) {
          bestDist = d;
          bestIdx = k;
        }
      }
      buckets[bestIdx]!.push(px);
    }
    // Пересчитываем центроиды как средние.
    const newCentroids: Array<[number, number, number]> = [];
    for (let k = 0; k < numColors; k++) {
      const bucket = buckets[k]!;
      if (bucket.length === 0) {
        newCentroids.push(centroids[k]!);
        continue;
      }
      let r = 0,
        g = 0,
        b = 0;
      for (const p of bucket) {
        r += p[0];
        g += p[1];
        b += p[2];
      }
      newCentroids.push([
        Math.round(r / bucket.length),
        Math.round(g / bucket.length),
        Math.round(b / bucket.length),
      ]);
    }
    centroids = newCentroids;
  }

  // 3. Сортируем по размеру кластера (популярности).
  const sizes: Array<{ centroid: [number, number, number]; size: number }> = centroids.map(
    (c) => {
      let count = 0;
      for (const px of pixels) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let k = 0; k < numColors; k++) {
          const cc = centroids[k]!;
          const d =
            (px[0] - cc[0]) ** 2 + (px[1] - cc[1]) ** 2 + (px[2] - cc[2]) ** 2;
          if (d < bestDist) {
            bestDist = d;
            bestIdx = k;
          }
        }
        if (centroids[bestIdx]! === c) count++;
      }
      return { centroid: c, size: count };
    },
  );
  sizes.sort((a, b) => b.size - a.size);

  // 4. Преобразуем в hex.
  return sizes.map(({ centroid }) => ({
    hex: rgbToHex(centroid[0], centroid[1], centroid[2]),
    name: null,
  }));
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}
