import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/engineering-workspace/app.js', import.meta.url), 'utf8');
const adapter = source.slice(source.indexOf('async function apiRequest('), source.indexOf('async function initializeApplication('));
const collections = ['parts', 'orders'];

function request(response, verifyFetch = () => {}) {
    return vm.runInNewContext(adapter + '\napiRequest', {
        storedToken: () => 'fixture-token',
        COLLECTIONS: collections,
        fetch(url, options) {
            verifyFetch(url, options);
            return response;
        }
    });
}

test('workspace rejects HTML success and incomplete record snapshots', async () => {
    const html = request(new Response('<html>Proxy response</html>', { status: 200 }));
    await assert.rejects(html('/data'), { status: 502, message: /invalid response/ });
    const incomplete = request(Response.json({ parts: [], _revision: 0 }));
    await assert.rejects(incomplete('/data'), { status: 502, message: /invalid response/ });
});

test('workspace accepts a valid snapshot and central list responses', async () => {
    const snapshot = { parts: [], orders: [], _revision: 0 };
    const data = request(Response.json(snapshot), (url, options) => {
        assert.equal(url, '/api/v1/engineering/data');
        assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    });
    assert.deepEqual(await data('/data'), snapshot);
    assert.deepEqual(await request(Response.json([]))('/users'), []);
});

test('workspace preserves the logout 204 and structured error contract', async () => {
    assert.equal(await request(new Response(null, { status: 204 }), (url) => {
        assert.equal(url, '/api/v1/auth/logout');
    })('/logout'), null);
    const denied = request(Response.json({ error: { message: 'Forbidden' } }, { status: 403 }));
    await assert.rejects(denied('/data'), { status: 403, message: 'Forbidden' });
    const proxyError = request(new Response('<html>Unavailable</html>', { status: 503 }));
    await assert.rejects(proxyError('/data'), { status: 503, message: /invalid response/ });
});
