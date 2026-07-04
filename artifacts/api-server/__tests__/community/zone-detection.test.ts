/**
 * Unit tests for Cyrillic-aware detection in Zone_Service (Task: Cyrillic regex fix).
 *
 * **Validates: Requirements 8.2, 7.4, 7.5** — детект русскоязычного контента:
 *   • `isMasterAdInSosedi` ловит рекламу услуг мастера в зоне соседей (8.2);
 *   • `classifyProContent` направляет чувствительный PRO-контент (чёрные списки
 *     клиентов, ПД, споры по объектам) в закрытый слой (7.4, 7.5).
 *
 * Контекст. Ранее детект молча ломался на кириллице: JS `\b` — ASCII-only и
 * никогда не утверждает границу рядом с русской буквой, а `\w` не матчит
 * кириллицу. Эти тесты фиксируют, что после перехода на Unicode-осознанные
 * границы (`(?<![\p{L}\p{N}])` / `(?![\p{L}\p{N}])`) и хвосты (`[\p{L}]*`) под
 * флагом `u` детект действительно срабатывает — и остаётся консервативным:
 * обычный соседский текст не даёт ложных срабатываний.
 *
 * Run: npx tsx --test ./__tests__/community/zone-detection.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isMasterAdInSosedi,
  classifyProContent,
} from "../../src/lib/zoneService.js";

// ─── isMasterAdInSosedi — детект рекламы мастера в Sosedi (Requirement 8.2) ──

describe("isMasterAdInSosedi — кириллический детект рекламы (Requirement 8.2)", () => {
  it("реклама 'Ремонт под ключ … услуги плиточника. Звоните!' → true", () => {
    const detected = isMasterAdInSosedi({
      zone: "sosedi",
      title: "Ремонт под ключ недорого",
      body: "Выполним любой ремонт квартир, услуги плиточника. Звоните!",
    });
    assert.equal(detected, true, "рекламное предложение услуг должно детектиться");
  });

  it("обычная соседская просьба 'кто одолжит перфоратор?' → false", () => {
    const detected = isMasterAdInSosedi({
      zone: "sosedi",
      title: "Соседи, кто одолжит перфоратор?",
      body: "Одолжите дрель на вечер, верну завтра.",
    });
    assert.equal(detected, false, "нейтральный соседский текст не должен детектиться");
  });

  it("отдельные рекламные маркеры на кириллице детектятся", () => {
    const cases = [
      "Мастер на все руки, любой ремонт",
      "Услуги электрика, недорого",
      "Гарантия на работы, звоните",
      "Опыт работы 15 лет, бригада выполнит ремонт",
      "Прайс на отделочные работы",
    ];
    for (const body of cases) {
      assert.equal(
        isMasterAdInSosedi({ zone: "sosedi", title: "", body }),
        true,
        `должно детектиться как реклама: "${body}"`,
      );
    }
  });

  it("нейтральные соседские темы НЕ детектятся (нет ложных срабатываний)", () => {
    const cases = [
      "Кто знает хорошего терапевта в районе?",
      "Потерялась кошка во дворе, помогите найти",
      "Во сколько завтра отключат воду?",
      "Спасибо соседу из 5 подъезда за помощь",
    ];
    for (const body of cases) {
      assert.equal(
        isMasterAdInSosedi({ zone: "sosedi", title: "", body }),
        false,
        `не должно детектиться как реклама: "${body}"`,
      );
    }
  });

  it("реклама вне зоны соседей (pro_public) → false (граница зон не нарушена)", () => {
    const detected = isMasterAdInSosedi({
      zone: "pro_public",
      title: "Ремонт под ключ",
      body: "Выполним любой ремонт, услуги плиточника. Звоните!",
    });
    assert.equal(detected, false);
  });
});

// ─── classifyProContent — чувствительный PRO-контент (Requirements 7.4, 7.5) ─

describe("classifyProContent — кириллическая классификация (Requirements 7.4, 7.5)", () => {
  it("'Клиент кинул на деньги, не заплатил' → sensitive → pro_protected", () => {
    const result = classifyProContent("Клиент кинул на деньги, не заплатил");
    assert.equal(result.sensitive, true);
    assert.equal(result.targetZone, "pro_protected");
    assert.ok(
      result.categories.includes("client_blacklist"),
      `ожидалась категория client_blacklist, получено: ${result.categories.join(", ")}`,
    );
  });

  it("чёрный список / ЧС детектится", () => {
    for (const text of [
      "Добавляю в чёрный список этого заказчика",
      "Кидалы, будьте осторожны",
      "Заказчик мошенник, не заплатил за работу",
    ]) {
      const r = classifyProContent(text);
      assert.equal(r.sensitive, true, `должно быть sensitive: "${text}"`);
      assert.equal(r.targetZone, "pro_protected");
    }
  });

  it("персональные данные детектятся → pro_protected", () => {
    for (const text of [
      "Паспорт 4509 123456, серия и номер",
      "Проживает по адресу: ул. Ленина 5",
      "Его СНИЛС и персональные данные",
    ]) {
      const r = classifyProContent(text);
      assert.equal(r.sensitive, true, `должно быть sensitive: "${text}"`);
      assert.ok(r.categories.includes("personal_data"));
    }
  });

  it("споры по объектам детектятся → pro_protected", () => {
    for (const text of [
      "Спор по объекту с заказчиком",
      "Подал исковое заявление, идёт разбирательство",
      "Претензия по работам на объекте",
    ]) {
      const r = classifyProContent(text);
      assert.equal(r.sensitive, true, `должно быть sensitive: "${text}"`);
      assert.equal(r.targetZone, "pro_protected");
    }
  });

  it("обычный профессиональный контент → НЕ sensitive → pro_public", () => {
    for (const text of [
      "Какой плиткорез посоветуете для керамогранита?",
      "Делюсь лайфхаком по выравниванию стен",
      "Обсудим новые материалы для гидроизоляции",
    ]) {
      const r = classifyProContent(text);
      assert.equal(r.sensitive, false, `не должно быть sensitive: "${text}"`);
      assert.equal(r.targetZone, "pro_public");
      assert.equal(r.categories.length, 0);
    }
  });

  it("пустой/пробельный ввод → pro_public, не sensitive", () => {
    for (const text of ["", "   ", null, undefined]) {
      const r = classifyProContent(text as string | null | undefined);
      assert.equal(r.sensitive, false);
      assert.equal(r.targetZone, "pro_public");
    }
  });
});
