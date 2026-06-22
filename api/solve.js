import { SYSTEM_PROMPT } from "./prompt.js";

export default async function handler(
    req,
    res
){

    try{

        if(
            req.method !== "POST"
        ){
            return res.status(405).json({
                error:
                    "Método no permitido"
            });
        }

        const password =
            req.body?.password;

        if(
            password !==
            process.env.APP_PASSWORD
        ){
            return res.status(401).json({
                error:
                    "Contraseña incorrecta"
            });
        }

        const caso =
            req.body?.caso;

        if(
            !caso ||
            !caso.trim()
        ){
            return res.status(400).json({
                error:
                    "Falta el caso"
            });
        }

        const prompt =
            SYSTEM_PROMPT.replace(
                "{{CASO}}",
                caso
            );

        const response =
            await fetch(
                "https://api.deepseek.com/chat/completions",
                {
                    method:"POST",
                    headers:{
                        "Authorization":
                            `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                        "Content-Type":
                            "application/json"
                    },
                    body:JSON.stringify({
                        model:
                            "deepseek-chat",
                        messages:[
                            {
                                role:"user",
                                content:
                                    prompt
                            }
                        ],
                        temperature:0
                    })
                }
            );

        const data =
            await response.json();

        if(
            !response.ok
        ){
            return res.status(
                response.status
            ).json({
                error:
                    "Error DeepSeek",
                deepseek:
                    data
            });
        }

        if(
            !data.choices ||
            !data.choices[0]
        ){
            return res.status(500)
                .json({
                    error:
                        "DeepSeek no devolvió respuesta",
                    deepseek:
                        data
                });
        }

        return res.status(200).json({
            answer:
                data.choices[0]
                    .message
                    .content
        });

    }catch(err){

        console.error(err);

        return res.status(500).json({
            error:
                err.message
        });

    }

}
