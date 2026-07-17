import { handleUpload } from "@vercel/blob/client";

const ENTRY_PATH = /^entries\/[A-Za-z0-9._-]{1,180}\.json$/;

function storageIsConnected(){
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export default async function handler(req, res){
    res.setHeader("Cache-Control", "no-store");

    if(req.method !== "POST"){
        res.setHeader("Allow", "POST");
        return res.status(405).json({
            error: "Método no permitido."
        });
    }

    if(!storageIsConnected()){
        return res.status(503).json({
            error: "El almacenamiento todavía no está conectado en Vercel."
        });
    }

    try{
        const result = await handleUpload({
            request: req,
            body: req.body,
            onBeforeGenerateToken: async pathname => {
                if(!ENTRY_PATH.test(pathname)){
                    throw new Error("Ruta de guardado no válida.");
                }

                return {
                    allowedContentTypes: ["application/json"],
                    addRandomSuffix: false,
                    allowOverwrite: false,
                    validUntil: Date.now() + (10 * 60 * 1000)
                };
            }
        });

        return res.status(200).json(result);
    }catch(error){
        console.error("No se pudo generar la carga:", error);

        return res.status(400).json({
            error: "No se pudo guardar el texto. Inténtalo nuevamente."
        });
    }
}
