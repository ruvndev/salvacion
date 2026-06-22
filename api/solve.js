export default async function handler(req, res) {

    try {

        console.log("BODY:", req.body);

        const caso =
            req.body?.caso ||
            "Caso de prueba";

        const response =
            await fetch(
                "https://api.deepseek.com/chat/completions",
                {
                    method: "POST",
                    headers: {
                        Authorization:
                            `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        model: "deepseek-chat",
                        messages: [
                            {
                                role: "user",
                                content: caso
                            }
                        ]
                    })
                }
            );

        const data =
            await response.json();

        console.log("DEEPSEEK:", data);

        if (!data.choices) {

            return res.status(500).json({
                error:
                    "DeepSeek no devolvió choices",
                deepseek:
                    data
            });
        }

        return res.json({
            answer:
                data.choices[0]
                    .message
                    .content
        });

    } catch (err) {

        console.error(err);

        return res.status(500).json({
            error:
                err.message
        });
    }
}
