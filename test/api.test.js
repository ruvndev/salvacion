import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import recoverHandler from "../api/recover.js";
import uploadHandler from "../api/upload.js";

const previousEnvironment = {
    APP_PASSWORD: process.env.APP_PASSWORD,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
    VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN
};

function responseMock(){
    return {
        body: undefined,
        headers: {},
        statusCode: 200,
        setHeader(name, value){
            this.headers[name] = value;
        },
        status(statusCode){
            this.statusCode = statusCode;
            return this;
        },
        json(body){
            this.body = body;
            return this;
        }
    };
}

function restore(name, value){
    if(value === undefined){
        delete process.env[name];
    }else{
        process.env[name] = value;
    }
}

before(() => {
    process.env.APP_PASSWORD = "contraseña-api";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
    delete process.env.VERCEL_OIDC_TOKEN;
});

after(() => {
    for(const [name, value] of Object.entries(previousEnvironment)){
        restore(name, value);
    }
});

test("el endpoint de carga rechaza métodos distintos de POST", async () => {
    const response = responseMock();
    await uploadHandler({ method: "GET" }, response);

    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.Allow, "POST");
});

test("la carga informa cuando Blob todavía no está conectado", async () => {
    const response = responseMock();
    await uploadHandler({ method: "POST", body: {} }, response);

    assert.equal(response.statusCode, 503);
    assert.match(response.body.error, /almacenamiento/i);
});

test("la recuperación rechaza una contraseña incorrecta", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    const response = responseMock();
    await recoverHandler({
        method: "POST",
        body: { password: "incorrecta" },
        headers: {}
    }, response);

    assert.equal(response.statusCode, 401);
    assert.equal(response.body.error, "Contraseña incorrecta.");
});

test("la recuperación entrega una sesión con la contraseña correcta", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    const response = responseMock();
    await recoverHandler({
        method: "POST",
        body: { password: "contraseña-api" },
        headers: {}
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ok, true);
    assert.equal(typeof response.body.token, "string");
    assert.ok(response.body.expiresAt > Date.now());
});

test("la lista rechaza una sesión inexistente antes de consultar Blob", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    const response = responseMock();
    await recoverHandler({
        method: "GET",
        query: {},
        headers: {}
    }, response);

    assert.equal(response.statusCode, 401);
    assert.match(response.body.error, /sesión/i);
});
