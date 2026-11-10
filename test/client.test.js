import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequestId } from '../src/client.js';

test('uses the browser UUID API when available', () => {
    assert.equal(createRequestId({ randomUUID: () => 'native-uuid' }), 'native-uuid');
});

test('generates a UUID with getRandomValues when randomUUID is unavailable', () => {
    const cryptoApi = {
        getRandomValues(bytes) {
            bytes.fill(0);
            return bytes;
        }
    };

    const requestId = createRequestId(cryptoApi);

    assert.match(requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});