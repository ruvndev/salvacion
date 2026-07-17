import {
    issueSignedToken,
    list,
    presignUrl
} from "@vercel/blob";
import {
    createRecoverySession,
    isCorrectPassword,
    readBearerToken,
    verifyRecoverySession
} from "../lib/recovery-session.js";

const ENTRIES_PREFIX = "entries/";
const PAGE_SIZE = 250;
const SIGNED_URL_DURATION_MS = 30 * 60 * 1000;

export function storageIsConnected(){
    return Boolean(
        process.env.BLOB_READ_WRITE_TOKEN ||
        process.env.BLOB_STORE_ID
    );
}

async function createSignedEntries(blobs){
    if(blobs.length === 0){
        return [];
    }

    const validUntil = Date.now() + SIGNED_URL_DURATION_MS;
    const signedToken = await issueSignedToken({
        pathname: "*",
        operations: ["get"],
        validUntil
    });

    return Promise.all(blobs.map(async blob => {
        const { presignedUrl } = await presignUrl(signedToken, {
            access: "private",
            operation: "get",
            pathname: blob.pathname,
            validUntil,
            useCache: true
        });

        return {
            pathname: blob.pathname,
            size: blob.size,
            uploadedAt: blob.uploadedAt,
            url: presignedUrl
        };
    }));
}

async function authenticate(req, res){
    const password = req.body?.password;

    if(!isCorrectPassword(password)){
        return res.status(401).json({
            error: "Contraseña incorrecta."
        });
    }

    const session = createRecoverySession();

    return res.status(200).json({
        ok: true,
        token: session.token,
        expiresAt: session.expiresAt
    });
}

async function listEntries(req, res){
    const sessionToken = readBearerToken(req.headers.authorization);

    if(!verifyRecoverySession(sessionToken)){
        return res.status(401).json({
            error: "La sesión expiró. Ingresa la contraseña nuevamente."
        });
    }

    const cursor = typeof req.query?.cursor === "string"
        ? req.query.cursor
        : undefined;

    const page = await list({
        prefix: ENTRIES_PREFIX,
        limit: PAGE_SIZE,
        cursor
    });

    return res.status(200).json({
        entries: await createSignedEntries(page.blobs),
        cursor: page.cursor ?? null,
        hasMore: page.hasMore
    });
}

export default async function handler(req, res){
    res.setHeader("Cache-Control", "no-store, max-age=0");

    if(!storageIsConnected()){
        return res.status(503).json({
            error: "El almacenamiento todavía no está conectado en Vercel."
        });
    }

    try{
        if(req.method === "POST"){
            return await authenticate(req, res);
        }

        if(req.method === "GET"){
            return await listEntries(req, res);
        }

        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({
            error: "Método no permitido."
        });
    }catch(error){
        console.error("No se pudieron recuperar los textos:", error);

        const message = error?.message === "APP_PASSWORD no está configurada."
            ? "La contraseña de recuperación no está configurada en Vercel."
            : "No se pudieron recuperar los textos. Inténtalo nuevamente.";

        return res.status(500).json({ error: message });
    }
}
