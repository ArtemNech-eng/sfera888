import { test } from "node:test";
import assert from "node:assert/strict";
import {
  screen,
  containsObscenity,
  containsPii,
  containsDefamation,
  isSpam,
} from "../src/lib/moderationService.js";

// ─── screen(): default allow (Requirement 19.1) ──────────────────────────────

test("clean neighbourly post → allow", () => {
  const v = screen({
    title: "Одолжу дрель",
    body: "Соседи, у кого есть дрель на вечер? Верну завтра утром.",
    zone: "sosedi",
  });
  assert.equal(v.action, "allow");
});

test("empty content → allow (screening is not a gate)", () => {
  assert.equal(screen({ title: "", body: "" }).action, "allow");
  assert.equal(screen({}).action, "allow");
});

// ─── screen(): spam is a hard block (Requirement 19.5) ───────────────────────

test("promo + link → block_spam", () => {
  const v = screen({
    body: "Скидка 50% только сегодня! Заказывайте на https://cheap-remont.ru",
    zone: "pro_public",
  });
  assert.equal(v.action, "block_spam");
});

test("promo + phone → block_spam", () => {
  const v = screen({
    body: "Ремонт дёшево, звоните +7 999 123 45 67, гарантия!",
    zone: "sosedi",
  });
  assert.equal(v.action, "block_spam");
});

test("three or more links → block_spam", () => {
  const v = screen({
    body: "смотри тут site1.ru и site2.com а ещё https://site3.net",
  });
  assert.equal(v.action, "block_spam");
});

// ─── screen(): PII / defamation restrict visibility (Requirement 19.2) ───────

test("PII in Sosedi (no protected layer) → unpublish", () => {
  const v = screen({
    body: "Пишите на почту ivan.petrov@example.com договоримся.",
    zone: "sosedi",
  });
  assert.equal(v.action, "unpublish");
  assert.equal(v.reason, "personal_data");
});

test("PII in PRO zone → restrict_to_protected", () => {
  const v = screen({
    body: "Клиент по паспорту 4509 123456 отказался платить.",
    zone: "pro_public",
  });
  assert.equal(v.action, "restrict_to_protected");
  assert.equal(v.reason, "personal_data");
});

test("defamation about a named person → restricted", () => {
  const v = screen({
    body: "Мастер Сергей — мошенник, взял предоплату и пропал.",
    zone: "pro_protected",
  });
  assert.equal(v.action, "restrict_to_protected");
  assert.match(v.reason ?? "", /defamation/);
});

test("PII when zone is unknown → prefers restrict_to_protected", () => {
  const v = screen({ body: "мой снилс 112-233-445 95" });
  assert.equal(v.action, "restrict_to_protected");
});

// ─── pure helpers ────────────────────────────────────────────────────────────

test("containsObscenity: English + Russian", () => {
  assert.equal(containsObscenity("this is shit"), true);
  assert.equal(containsObscenity("вот блядь опять"), true);
  assert.equal(containsObscenity("обычный вежливый текст"), false);
});

test("containsPii: phone / email / passport / snils / inn", () => {
  assert.equal(containsPii("звони 8 (999) 123-45-67"), true);
  assert.equal(containsPii("mail me at a.b@c.io"), true);
  assert.equal(containsPii("паспорт: 4509 123456"), true);
  assert.equal(containsPii("СНИЛС 112-233-445 95"), true);
  assert.equal(containsPii("ИНН 7701234567"), true);
  assert.equal(containsPii("просто текст без данных"), false);
});

test("containsDefamation: needs accusation + named subject", () => {
  assert.equal(containsDefamation("Иван кидала и вор"), true);
  // accusation without a named subject → not flagged
  assert.equal(containsDefamation("кругом одни мошенники"), false);
  // named subject without accusation → not flagged
  assert.equal(containsDefamation("Спасибо Ивану за помощь"), false);
});

test("isSpam: heuristic signals", () => {
  assert.equal(isSpam("Купите сейчас со скидкой на shop.ru"), true);
  assert.equal(isSpam("ааааааааааааааааа"), true);
  assert.equal(isSpam("Обычное сообщение о протечке в подъезде"), false);
});
