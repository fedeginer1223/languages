import assert from 'node:assert/strict';
import { composeSession } from '../src/utils/sessionComposer';

const arr = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`);
const sizes = (r: ReturnType<typeof composeSession>) => [r.reviews.length, r.newItems.length, r.remainingReviews, r.remainingNew];

// 1. balanced: plenty of both -> 15 + 15
assert.deepEqual(sizes(composeSession({ reviews: arr(40, 'r'), newItems: arr(40, 'n'), sessionSize: 30 })), [15, 15, 25, 25]);
// 2. few reviews -> filled with new
assert.deepEqual(sizes(composeSession({ reviews: arr(4, 'r'), newItems: arr(40, 'n'), sessionSize: 30 })), [4, 26, 0, 14]);
// 3. few new -> filled with reviews
const r3 = composeSession({ reviews: arr(40, 'r'), newItems: arr(3, 'n'), sessionSize: 30 });
assert.deepEqual(sizes(r3), [27, 3, 13, 0]);
assert.equal(r3.reviews[0], 'r0'); // priority order preserved
// 4. both short
assert.deepEqual(sizes(composeSession({ reviews: arr(5, 'r'), newItems: arr(2, 'n'), sessionSize: 30 })), [5, 2, 0, 0]);
console.log('sessionComposer: 4/4 cases OK');
