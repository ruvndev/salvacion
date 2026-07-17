import {
    createHash,
    createHmac,
    randomBytes,
    timingSafeEqual
} from "node:crypto";

const SESSION_DURATION_MS = 30 * 60 * 1000;

function getPassword(){
    const password = process.env.APP_PASSWORD;

    if(!password){
        throw new Error("APP_PASSWORD no está configurada.");
    }

    return password;
}

function digest(value){
    return createHash("sha256")
        .update(String(value), "utf8")
        .digest();
}

function sign(payload){
    return createHmac("sha256", getPassword())
        .update(`salvacion-recovery:${payload}`, "utf8")
        .digest("base64url");
}

export function isCorrectPassword(candidate){
    if(typeof candidate !== "string"){
        return false;
    }

    return timingSafeEqual(
        digest(candidate),
        digest(getPassword())
    );
}

export function createRecoverySession(now = Date.now()){
    const payload = Buffer.from(JSON.stringify({
        exp: now + SESSION_DURATION_MS,
        nonce: randomBytes(16).toString("base64url")
    }), "utf8").toString("base64url");

    return {
        token: `${payload}.${sign(payload)}`,
        expiresAt: now + SESSION_DURATION_MS
    };
}

export function verifyRecoverySession(token, now = Date.now()){
    if(typeof token !== "string"){
        return false;
    }

    const separator = token.lastIndexOf(".");

    if(separator < 1){
        return false;
    }

    const payload = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const expectedSignature = sign(payload);

    if(!timingSafeEqual(digest(signature), digest(expectedSignature))){
        return false;
    }

    try{
        const decoded = JSON.parse(
            Buffer.from(payload, "base64url").toString("utf8")
        );

        return Number.isFinite(decoded.exp) && decoded.exp > now;
    }catch{
        return false;
    }
}

export function readBearerToken(authorization){
    if(typeof authorization !== "string"){
        return "";
    }

    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match?.[1] ?? "";
}
