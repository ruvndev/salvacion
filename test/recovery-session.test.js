import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
    createRecoverySession,
    isCorrectPassword,
    readBearerToken,
    verifyRecoverySession
} from "../lib/recovery-session.js";

const previousPassword = process.env.APP_PASSWORD;

before(() => {
    process.env.APP_PASSWORD = "una-contraseña-de-prueba";
});

after(() => {
    if(previousPassword === undefined){
        delete process.env.APP_PASSWORD;
    }else{
        process.env.APP_PASSWORD = previousPassword;
    }
});

test("acepta únicamente la contraseña exacta", () => {
    assert.equal(isCorrectPassword("una-contraseña-de-prueba"), true);
    assert.equal(isCorrectPassword("otra"), false);
    assert.equal(isCorrectPassword(null), false);
});

test("crea una sesión válida y la rechaza al vencer", () => {
    const now = 1_800_000_000_000;
    const session = createRecoverySession(now);

    assert.equal(verifyRecoverySession(session.token, now), true);
    assert.equal(verifyRecoverySession(session.token, session.expiresAt), false);
});

test("rechaza una sesión manipulada", () => {
    const session = createRecoverySession();
    const token = `${session.token.slice(0, -1)}x`;

    assert.equal(verifyRecoverySession(token), false);
});

test("extrae solo tokens Bearer", () => {
    assert.equal(readBearerToken("Bearer abc.def"), "abc.def");
    assert.equal(readBearerToken("bearer token"), "token");
    assert.equal(readBearerToken("Basic abc"), "");
    assert.equal(readBearerToken(undefined), "");
});
