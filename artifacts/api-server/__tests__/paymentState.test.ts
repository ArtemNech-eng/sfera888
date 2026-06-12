import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computePaymentState,
  computePaymentStateBatch,
  groupReceiptsByOrder,
  type OrderForPaymentState,
  type ReceiptForPaymentState,
} from "../src/lib/paymentState.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function order(overrides: Partial<OrderForPaymentState> = {}): OrderForPaymentState {
  return {
    status: "master_assigned",
    commissionPaid: false,
    orderAmount: null,
    ...overrides,
  };
}

function receipt(overrides: Partial<ReceiptForPaymentState> = {}): ReceiptForPaymentState {
  return {
    prepaymentAmount: "5000",
    prepaymentSeenAt: null,
    prepaymentSubmittedAt: null,
    ...overrides,
  };
}

// ─── Validates: Property 2, Requirements 1.1, 12.1 ───────────────────────────

test("cancelled order returns 'cancelled' regardless of other fields", () => {
  // Pure cancelled
  assert.equal(computePaymentState(order({ status: "cancelled" }), []), "cancelled");

  // cancelled + commissionPaid -- cancelled wins
  assert.equal(
    computePaymentState(order({ status: "cancelled", commissionPaid: true }), []),
    "cancelled",
  );

  // cancelled + orderAmount -- cancelled wins
  assert.equal(
    computePaymentState(order({ status: "cancelled", orderAmount: "10000" }), []),
    "cancelled",
  );

  // cancelled + paid receipt -- cancelled wins
  assert.equal(
    computePaymentState(
      order({ status: "cancelled" }),
      [receipt({ prepaymentSeenAt: new Date() })],
    ),
    "cancelled",
  );

  // cancelled with EVERYTHING -- still cancelled
  assert.equal(
    computePaymentState(
      order({ status: "cancelled", commissionPaid: true, orderAmount: "10000" }),
      [receipt({ prepaymentSeenAt: new Date(), prepaymentAmount: "5000" })],
    ),
    "cancelled",
  );
});

// ─── Validates: Requirements 1.1, 7.4 ────────────────────────────────────────

test("commissionPaid=true returns 'paid' (without cancelled)", () => {
  assert.equal(
    computePaymentState(order({ commissionPaid: true, orderAmount: "8000" }), []),
    "paid",
  );

  // Even without orderAmount, if commissionPaid is true (manager force-paid), it's paid
  assert.equal(
    computePaymentState(order({ commissionPaid: true, orderAmount: null }), []),
    "paid",
  );
});

// ─── Validates: Requirements 1.1, 3.4 ────────────────────────────────────────

test("all receipts with prepaymentSeenAt return 'paid'", () => {
  const seen = new Date();
  assert.equal(
    computePaymentState(
      order({ orderAmount: "10000" }),
      [receipt({ prepaymentSeenAt: seen })],
    ),
    "paid",
  );

  // Multiple receipts, all confirmed
  assert.equal(
    computePaymentState(
      order({ orderAmount: "10000" }),
      [
        receipt({ prepaymentSeenAt: seen, prepaymentAmount: "3000" }),
        receipt({ prepaymentSeenAt: seen, prepaymentAmount: "5000" }),
      ],
    ),
    "paid",
  );
});

// ─── Validates: Requirements 1.1, 3.4 (negative case) ────────────────────────

test("partial seenAt (one confirmed, one not) -> NOT paid, returns 'agreed'", () => {
  assert.equal(
    computePaymentState(
      order({ orderAmount: "10000" }),
      [
        receipt({ prepaymentSeenAt: new Date(), prepaymentAmount: "3000" }),
        receipt({ prepaymentSeenAt: null, prepaymentAmount: "5000" }),
      ],
    ),
    "agreed",
  );
});

// ─── Validates: Requirements 1.1, 2.5 ────────────────────────────────────────

test("orderAmount > 0 without receipts returns 'agreed'", () => {
  assert.equal(
    computePaymentState(order({ orderAmount: "8000" }), []),
    "agreed",
  );
  // Numeric type
  assert.equal(
    computePaymentState(order({ orderAmount: 8000 }), []),
    "agreed",
  );
});

// ─── Validates: Requirements 1.1, 3.2 ────────────────────────────────────────

test("receipt with prepaymentAmount > 0 without orderAmount returns 'agreed'", () => {
  assert.equal(
    computePaymentState(
      order({ orderAmount: null }),
      [receipt({ prepaymentAmount: "3000" })],
    ),
    "agreed",
  );
});

// ─── Validates: Requirements 1.1 (default state) ─────────────────────────────

test("empty order returns 'no_amount'", () => {
  assert.equal(computePaymentState(order(), []), "no_amount");
});

// ─── Validates: Property 3 (monotonicity) ────────────────────────────────────

test("state transitions: no_amount -> agreed -> paid", () => {
  // Start: nothing
  assert.equal(computePaymentState(order(), []), "no_amount");

  // Step 1: orderAmount set -> agreed
  assert.equal(computePaymentState(order({ orderAmount: "8000" }), []), "agreed");

  // Step 2: receipt confirmed -> paid
  assert.equal(
    computePaymentState(
      order({ orderAmount: "8000" }),
      [receipt({ prepaymentSeenAt: new Date() })],
    ),
    "paid",
  );

  // Alternative step 2: commissionPaid manually -> paid
  assert.equal(
    computePaymentState(order({ orderAmount: "8000", commissionPaid: true }), []),
    "paid",
  );
});

// ─── Validates: Requirements 1.1 (zero values are equivalent to null) ────────

test("orderAmount = 0 returns 'no_amount' (not 'agreed')", () => {
  assert.equal(computePaymentState(order({ orderAmount: "0" }), []), "no_amount");
  assert.equal(computePaymentState(order({ orderAmount: 0 }), []), "no_amount");
});

test("orderAmount = null returns 'no_amount'", () => {
  assert.equal(computePaymentState(order({ orderAmount: null }), []), "no_amount");
});

// ─── Validates: Requirements 1.1 (mixed signals) ─────────────────────────────

test("mixed: orderAmount + unconfirmed receipt -> 'agreed'", () => {
  assert.equal(
    computePaymentState(
      order({ orderAmount: "8000" }),
      [receipt({ prepaymentSeenAt: null, prepaymentAmount: "3000" })],
    ),
    "agreed",
  );
});

// ─── Validates: Property 1 (determinism) ─────────────────────────────────────

test("computePaymentState is deterministic (pure function)", () => {
  const inputs: Array<[OrderForPaymentState, ReceiptForPaymentState[]]> = [
    [order(), []],
    [order({ orderAmount: "8000" }), []],
    [order({ commissionPaid: true }), []],
    [order({ status: "cancelled" }), []],
    [
      order({ orderAmount: "10000" }),
      [receipt({ prepaymentSeenAt: new Date(2026, 0, 1) })],
    ],
  ];

  for (const [o, rs] of inputs) {
    const first = computePaymentState(o, rs);
    const second = computePaymentState(o, rs);
    const third = computePaymentState(o, rs);
    assert.equal(first, second, `non-deterministic for input ${JSON.stringify(o)}`);
    assert.equal(second, third, `non-deterministic for input ${JSON.stringify(o)}`);
  }
});

// ─── Batch helper ─────────────────────────────────────────────────────────────

test("computePaymentStateBatch handles empty + multiple orders correctly", () => {
  const orders = [
    { id: 1, ...order() },
    { id: 2, ...order({ orderAmount: "5000" }) },
    { id: 3, ...order({ commissionPaid: true }) },
    { id: 4, ...order({ status: "cancelled" }) },
  ] as Parameters<typeof computePaymentStateBatch>[0];

  const receiptsByOrder = new Map<number, ReceiptForPaymentState[]>();
  receiptsByOrder.set(2, [receipt({ prepaymentSeenAt: new Date() })]);

  const result = computePaymentStateBatch(orders, receiptsByOrder);

  // Order 1: no signals -> no_amount
  assert.equal(result.get(1), "no_amount");
  // Order 2: orderAmount + paid receipt -> paid
  assert.equal(result.get(2), "paid");
  // Order 3: commissionPaid -> paid
  assert.equal(result.get(3), "paid");
  // Order 4: cancelled -> cancelled
  assert.equal(result.get(4), "cancelled");
});

// ─── groupReceiptsByOrder helper ──────────────────────────────────────────────

test("groupReceiptsByOrder groups correctly by orderId", () => {
  const flat = [
    { orderId: 1, prepaymentAmount: "1000", prepaymentSeenAt: null },
    { orderId: 2, prepaymentAmount: "2000", prepaymentSeenAt: null },
    { orderId: 1, prepaymentAmount: "3000", prepaymentSeenAt: null },
    { orderId: 3, prepaymentAmount: "4000", prepaymentSeenAt: null },
  ];
  const grouped = groupReceiptsByOrder(flat);

  assert.equal(grouped.get(1)?.length, 2);
  assert.equal(grouped.get(2)?.length, 1);
  assert.equal(grouped.get(3)?.length, 1);
  assert.equal(grouped.get(4), undefined);
  assert.equal(grouped.get(1)?.[0].prepaymentAmount, "1000");
  assert.equal(grouped.get(1)?.[1].prepaymentAmount, "3000");
});
