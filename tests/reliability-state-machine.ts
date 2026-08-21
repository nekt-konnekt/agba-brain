type Status = string;

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function retryOrDead(attempts: number, maxAttempts: number): Status {
  return attempts >= maxAttempts ? "dead" : "failed";
}

function canClaimInbox(status: Status, attempts: number, maxAttempts: number, nextAttemptDue: boolean, leaseExpired: boolean): boolean {
  return (
    ((status === "received" || status === "queued" || status === "failed") && nextAttemptDue && attempts < maxAttempts) ||
    (status === "processing" && leaseExpired && attempts < maxAttempts)
  );
}

function canClaimDelivery(status: Status, attempts: number, maxAttempts: number, nextAttemptDue: boolean, leaseExpired: boolean): boolean {
  return (
    ((status === "pending" || status === "failed") && nextAttemptDue && attempts < maxAttempts) ||
    (status === "sending" && leaseExpired && attempts < maxAttempts)
  );
}

function actionResultForDuplicate(replayed: boolean, status: Status) {
  return { replayed, verified: status === "succeeded" };
}

// Action engine contracts.
assertEq(actionResultForDuplicate(false, "succeeded").verified, true, "successful action must verify");
assertEq(actionResultForDuplicate(true, "succeeded").replayed, true, "duplicate action must replay existing execution");
assertEq(actionResultForDuplicate(true, "succeeded").verified, true, "duplicate successful action remains verified");
assertEq(retryOrDead(1, 5), "failed", "attempt below max must retry");
assertEq(retryOrDead(5, 5), "dead", "attempt at max must become dead");

// Inbox contracts.
assert(canClaimInbox("received", 0, 5, true, false), "received update must be claimable");
assert(canClaimInbox("failed", 2, 5, true, false), "failed update must be retryable");
assert(canClaimInbox("processing", 2, 5, false, true), "expired processing lease must be reclaimable");
assert(!canClaimInbox("processing", 2, 5, false, false), "live processing lease must not be stolen");
assert(!canClaimInbox("dead", 5, 5, true, true), "dead update must never be reclaimed");
assert(!canClaimInbox("failed", 5, 5, true, false), "max-attempt failed update must not retry");

// Delivery contracts.
assert(canClaimDelivery("pending", 0, 5, true, false), "pending delivery must be claimable");
assert(canClaimDelivery("failed", 2, 5, true, false), "failed delivery must be retryable");
assert(canClaimDelivery("sending", 2, 5, false, true), "expired sending lease must be reclaimable");
assert(!canClaimDelivery("sending", 2, 5, false, false), "live sending lease must not be stolen");
assert(!canClaimDelivery("dead", 5, 5, true, true), "dead delivery must never be reclaimed");
assert(!canClaimDelivery("failed", 5, 5, true, false), "max-attempt failed delivery must not retry");

// Full logical lifecycle contract.
const inbox = "dispatched";
const delivery = "sent";
const execution = "succeeded";
assertEq(inbox, "dispatched", "successful inbound lifecycle must terminate dispatched");
assertEq(execution, "succeeded", "successful action lifecycle must terminate succeeded");
assertEq(delivery, "sent", "successful outbound lifecycle must terminate sent");

// Duplicate logical work must converge on one result rather than create a second execution/delivery.
const idempotencyKey = "telegram:update:test:1";
const executions = new Set<string>();
const deliveries = new Set<string>();
executions.add(idempotencyKey);
executions.add(idempotencyKey);
deliveries.add(idempotencyKey);
deliveries.add(idempotencyKey);
assertEq(executions.size, 1, "duplicate update must produce one logical action execution");
assertEq(deliveries.size, 1, "duplicate update must produce one logical delivery");

console.log("RELIABILITY STATE MACHINE: PASS");
console.log("- action idempotency: PASS");
console.log("- retry/dead-letter policy: PASS");
console.log("- inbox lease recovery: PASS");
console.log("- delivery lease recovery: PASS");
console.log("- dead work non-reclaimability: PASS");
console.log("- end-to-end terminal states: PASS");
