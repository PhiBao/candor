/**
 * Canonical Candor hashing — the single source of truth for every value the
 * circuit also derives via Compact's `persistentHash`.
 *
 * The circuit computes:
 *   memberLeaf  = persistentHash([pad(32,"candor:member:v1"), secret])
 *   nullifier   = persistentHash([pad(32,"candor:nf:v1"), epoch, secret])
 *   bucketKey   = persistentHash([cutKey, bucket])
 *   issuerCommit = persistentHash([pad(32,"candor:issuer:v1"), issuerKey])
 *   cutKey      = persistentHash([pad(32,"candor:cutkey:v1"), pad(32,"family:level:region")])
 *
 * This module uses the SAME runtime primitives (compact-runtime persistentHash
 * with the same type descriptors), so TS-derived values are bit-identical to
 * circuit-derived values. The circuit-test parity suite asserts this.
 */
import { persistentHash, CompactTypeBytes, CompactTypeVector, CompactTypeUnsignedInteger, } from "@midnight-ntwrk/compact-runtime";
// Descriptors mirroring the generated contract code
const B32 = new CompactTypeBytes(32);
const U8 = new CompactTypeUnsignedInteger(255n, 1);
const U64 = new CompactTypeUnsignedInteger(18446744073709551615n, 8);
const V2B32 = new CompactTypeVector(2, B32);
/** [Bytes<32>, Uint<8>] tuple descriptor (same field order as the circuit) */
class TupleB32U8 {
    alignment() {
        return B32.alignment().concat(U8.alignment());
    }
    fromValue(value) {
        return [B32.fromValue(value), U8.fromValue(value)];
    }
    toValue(value) {
        return B32.toValue(value[0]).concat(U8.toValue(value[1]));
    }
}
/** [Bytes<32>, Uint<64>, Bytes<32>] tuple descriptor */
class TupleB32U64B32 {
    alignment() {
        return B32.alignment().concat(U64.alignment().concat(B32.alignment()));
    }
    fromValue(value) {
        return [B32.fromValue(value), U64.fromValue(value), B32.fromValue(value)];
    }
    toValue(value) {
        return B32.toValue(value[0]).concat(U64.toValue(value[1]).concat(B32.toValue(value[2])));
    }
}
const TUPLE_B32_U8 = new TupleB32U8();
const TUPLE_B32_U64_B32 = new TupleB32U64B32();
const ENC = new TextEncoder();
/** pad(n, "string") in Compact: UTF-8 bytes, zero-padded on the right to n bytes. */
export function pad32(s) {
    const bytes = ENC.encode(s);
    if (bytes.length > 32)
        throw new Error(`string longer than 32 bytes: ${s}`);
    const out = new Uint8Array(32);
    out.set(bytes, 0);
    return out;
}
function assert32(name, v) {
    if (v.length !== 32)
        throw new Error(`${name} must be 32 bytes, got ${v.length}`);
}
/** leaf the user derives locally and hands to the issuer (secret itself never leaves) */
export function memberLeaf(secret) {
    assert32("secret", secret);
    return persistentHash(V2B32, [pad32("candor:member:v1"), secret]);
}
/** epoch-scoped nullifier derived inside the circuit; preimage never disclosed */
export function epochNullifier(epoch, secret) {
    assert32("secret", secret);
    return persistentHash(TUPLE_B32_U64_B32, [pad32("candor:nf:v1"), epoch, secret]);
}
/** on-chain histogram key for a (cutKey, bucket) pair */
export function bucketKeyBytes(cutKey, bucket) {
    assert32("cutKey", cutKey);
    return persistentHash(TUPLE_B32_U8, [cutKey, bucket]);
}
/** commitment the deployer puts in the constructor; issuerKey stays secret */
export function issuerCommitment(issuerKey) {
    assert32("issuerKey", issuerKey);
    return persistentHash(V2B32, [pad32("candor:issuer:v1"), issuerKey]);
}
/** deterministic Bytes<32> key for a cut string ("family:level:region", ≤32 bytes) */
export function cutKeyBytes(cutString) {
    return persistentHash(V2B32, [pad32("candor:cutkey:v1"), pad32(cutString)]);
}
export function bytesToHex(b) {
    return Array.from(b)
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
}
