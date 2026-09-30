/**
 * Canonical GotIt hashing — the single source of truth for every value the
 * circuit also derives via Compact's `persistentHash`.
 *
 * TWO VERSIONS LIVE HERE, DELIBERATELY.
 *
 * v1 (`candor:*:v1`) backs the contract deployed on Preprod at
 * e7cf6ffc48ebeb450813104e6a5ab3d585f7e275bcd32e5ea82eb7a8c21dd53d. Those
 * strings are inputs to that contract's hash derivations, so they are FROZEN:
 * changing them would make TS-derived values disagree with existing on-chain
 * state and every prior member would be rejected as "not a member". Do not
 * "fix" them casually.
 *
 * v2 (`gotit:*:v2`) backs the Wave 2 ledger, which adds the Directive's
 * "category of worker" x gender x base/variable dimensions and moves
 * disclosure control into the read circuits. It is a SEPARATE CONTRACT, not a
 * migration: a v1 leaf does not validate against v2, which is exactly what the
 * version bump is for.
 *
 * The circuit computes:
 *   v1: memberLeaf = persistentHash([pad(32,"candor:member:v1"), secret])
 *       nullifier  = persistentHash([pad(32,"candor:nf:v1"), epoch, secret])
 *       bucketKey  = persistentHash([cutKey, bucket])
 *       issuerCommit = persistentHash([pad(32,"candor:issuer:v1"), issuerKey])
 *       cutKey     = persistentHash([pad(32,"candor:cutkey:v1"), pad(32,cut)])
 *
 *   v2: memberLeaf2 = persistentHash([pad(32,"gotit:member:v2"), secret])
 *       nullifier2  = persistentHash([pad(32,"gotit:nf:v2"), epoch, secret])
 *       categoryKey = persistentHash([pad(32,"gotit:catkey:v2"), pad(32,label)])
 *       bucketKey2  = persistentHash([categoryKey, gender, component, bucket])
 *       groupKey    = persistentHash([categoryKey, gender, component])
 *       issuerCommit2 = persistentHash([pad(32,"gotit:issuer:v2"), issuerKey])
 *
 * This module uses the SAME runtime primitives (compact-runtime persistentHash
 * with the same type descriptors), so TS-derived values are bit-identical to
 * circuit-derived values. The circuit-test parity suites assert this.
 */
import {
  persistentHash,
  CompactTypeBytes,
  CompactTypeVector,
  CompactTypeUnsignedInteger,
  type CompactType,
  type Value,
  type Alignment,
} from "@midnight-ntwrk/compact-runtime";

// Descriptors mirroring the generated contract code
const B32 = new CompactTypeBytes(32);
const U8 = new CompactTypeUnsignedInteger(255n, 1);
const U64 = new CompactTypeUnsignedInteger(18446744073709551615n, 8);
const V2B32 = new CompactTypeVector(2, B32);

/** [Bytes<32>, Uint<8>] tuple descriptor (same field order as the circuit) */
class TupleB32U8 implements CompactType<[Uint8Array, bigint]> {
  alignment(): Alignment {
    return B32.alignment().concat(U8.alignment());
  }
  fromValue(value: Value): [Uint8Array, bigint] {
    return [B32.fromValue(value), U8.fromValue(value)] as unknown as [Uint8Array, bigint];
  }
  toValue(value: [Uint8Array, bigint]): Value {
    return B32.toValue(value[0]).concat(U8.toValue(value[1])) as unknown as Value;
  }
}

/** [Bytes<32>, Uint<8>, Uint<8>] tuple descriptor — v2 group key */
class TupleB32U8U8 implements CompactType<[Uint8Array, bigint, bigint]> {
  alignment(): Alignment {
    return B32.alignment().concat(U8.alignment()).concat(U8.alignment());
  }
  fromValue(value: Value): [Uint8Array, bigint, bigint] {
    return [B32.fromValue(value), U8.fromValue(value), U8.fromValue(value)] as unknown as [
      Uint8Array,
      bigint,
      bigint,
    ];
  }
  toValue(value: [Uint8Array, bigint, bigint]): Value {
    return B32.toValue(value[0])
      .concat(U8.toValue(value[1]))
      .concat(U8.toValue(value[2])) as unknown as Value;
  }
}

/** [Bytes<32>, Uint<8>, Uint<8>, Uint<8>] tuple descriptor — v2 bucket key */
class TupleB32U8U8U8 implements CompactType<[Uint8Array, bigint, bigint, bigint]> {
  alignment(): Alignment {
    return B32.alignment().concat(U8.alignment()).concat(U8.alignment()).concat(U8.alignment());
  }
  fromValue(value: Value): [Uint8Array, bigint, bigint, bigint] {
    return [
      B32.fromValue(value),
      U8.fromValue(value),
      U8.fromValue(value),
      U8.fromValue(value),
    ] as unknown as [Uint8Array, bigint, bigint, bigint];
  }
  toValue(value: [Uint8Array, bigint, bigint, bigint]): Value {
    return B32.toValue(value[0])
      .concat(U8.toValue(value[1]))
      .concat(U8.toValue(value[2]))
      .concat(U8.toValue(value[3])) as unknown as Value;
  }
}

/** [Bytes<32>, Uint<64>, Bytes<32>] tuple descriptor */
class TupleB32U64B32 implements CompactType<[Uint8Array, bigint, Uint8Array]> {
  alignment(): Alignment {
    return B32.alignment().concat(U64.alignment().concat(B32.alignment()));
  }
  fromValue(value: Value): [Uint8Array, bigint, Uint8Array] {
    return [B32.fromValue(value), U64.fromValue(value), B32.fromValue(value)] as unknown as [Uint8Array, bigint, Uint8Array];
  }
  toValue(value: [Uint8Array, bigint, Uint8Array]): Value {
    return B32.toValue(value[0]).concat(U64.toValue(value[1]).concat(B32.toValue(value[2]))) as unknown as Value;
  }
}

const TUPLE_B32_U8 = new TupleB32U8();
const TUPLE_B32_U64_B32 = new TupleB32U64B32();
const TUPLE_B32_U8_U8 = new TupleB32U8U8();
const TUPLE_B32_U8_U8_U8 = new TupleB32U8U8U8();

const ENC = new TextEncoder();

/** pad(n, "string") in Compact: UTF-8 bytes, zero-padded on the right to n bytes. */
export function pad32(s: string): Uint8Array {
  const bytes = ENC.encode(s);
  if (bytes.length > 32) throw new Error(`string longer than 32 bytes: ${s}`);
  const out = new Uint8Array(32);
  out.set(bytes, 0);
  return out;
}

function assert32(name: string, v: Uint8Array): void {
  if (v.length !== 32) throw new Error(`${name} must be 32 bytes, got ${v.length}`);
}

// ===========================================================================
// v1 — frozen. Backs contract e7cf6ffc…dd53d, deployed on Preprod in Wave 1.
// ===========================================================================

/** leaf the user derives locally and hands to the issuer (secret itself never leaves) */
export function memberLeaf(secret: Uint8Array): Uint8Array {
  assert32("secret", secret);
  return persistentHash(V2B32, [pad32("candor:member:v1"), secret]);
}

/** epoch-scoped nullifier derived inside the circuit; preimage never disclosed */
export function epochNullifier(epoch: bigint, secret: Uint8Array): Uint8Array {
  assert32("secret", secret);
  return persistentHash(TUPLE_B32_U64_B32, [pad32("candor:nf:v1"), epoch, secret]);
}

/** on-chain histogram key for a (cutKey, bucket) pair */
export function bucketKeyBytes(cutKey: Uint8Array, bucket: bigint): Uint8Array {
  assert32("cutKey", cutKey);
  return persistentHash(TUPLE_B32_U8, [cutKey, bucket]);
}

/** commitment the deployer puts in the constructor; issuerKey stays secret */
export function issuerCommitment(issuerKey: Uint8Array): Uint8Array {
  assert32("issuerKey", issuerKey);
  return persistentHash(V2B32, [pad32("candor:issuer:v1"), issuerKey]);
}

/** deterministic Bytes<32> key for a cut string ("family:level:region", ≤32 bytes) */
export function cutKeyBytes(cutString: string): Uint8Array {
  return persistentHash(V2B32, [pad32("candor:cutkey:v1"), pad32(cutString)]);
}

// ===========================================================================
// v2 — Wave 2. Category of worker x gender x base/variable.
// ===========================================================================

/** leaf for the v2 contract (secret itself still never leaves the device) */
export function memberLeaf2(secret: Uint8Array): Uint8Array {
  assert32("secret", secret);
  return persistentHash(V2B32, [pad32("gotit:member:v2"), secret]);
}

/** epoch-scoped nullifier for v2 */
export function epochNullifier2(epoch: bigint, secret: Uint8Array): Uint8Array {
  assert32("secret", secret);
  return persistentHash(TUPLE_B32_U64_B32, [pad32("gotit:nf:v2"), epoch, secret]);
}

/**
 * Key for an employer's "category of worker" label.
 *
 * The label itself is hashed rather than stored, so the chain carries no
 * free text — the employer publishes the label<->hash mapping in the report
 * itself. Label is capped at 32 bytes because Compact's `pad` is fixed-width;
 * longer labels are hashed again off-chain by the caller if needed.
 */
export function categoryKeyBytes(label: string): Uint8Array {
  return persistentHash(V2B32, [pad32("gotit:catkey:v2"), pad32(label)]);
}

/** v2 histogram key: (categoryKey, gender, component, bucket) */
export function bucketKeyBytes2(
  categoryKey: Uint8Array,
  gender: number | bigint,
  component: number | bigint,
  bucket: number | bigint,
): Uint8Array {
  assert32("categoryKey", categoryKey);
  return persistentHash(TUPLE_B32_U8_U8_U8, [
    categoryKey,
    BigInt(gender),
    BigInt(component),
    BigInt(bucket),
  ]);
}

/** v2 group key: (categoryKey, gender, component) — the unit the k-gate applies to */
export function groupKeyBytes(
  categoryKey: Uint8Array,
  gender: number | bigint,
  component: number | bigint,
): Uint8Array {
  assert32("categoryKey", categoryKey);
  return persistentHash(TUPLE_B32_U8_U8, [categoryKey, BigInt(gender), BigInt(component)]);
}

/** issuer commitment for the v2 constructor */
export function issuerCommitment2(issuerKey: Uint8Array): Uint8Array {
  assert32("issuerKey", issuerKey);
  return persistentHash(V2B32, [pad32("gotit:issuer:v2"), issuerKey]);
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
