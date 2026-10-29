import "dotenv/config";
import express from "express";
import cors from "cors";
import { analisarDocumento } from "./analyzer.ts";
import { provedorDoAmbiente } from "./llm.ts";

const app = express();
const provedor = provedorDoAmbiente();

app.use(cors());
app.use(express.json({ limit: "200kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, provedor: provedor.nome });
});

app.post("/analisar", async (req, res) => {
  const { texto, descricao } = req.body ?? {};
  if (typeof texto !== "string") {
    return res.status(400).json({ erro: "Envie o campo 'texto' com o conteúdo do documento." });
  }

  try {
    const resultado = await analisarDocumento(texto, provedor, descricao);
    res.json(resultado);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Erro inesperado";
    // O texto do documento nunca vai para o log: pode ter dado de paciente
    console.error(`Falha na análise: ${mensagem}`);
    res.status(422).json({ erro: mensagem });
  }
});

const porta = Number(process.env.PORT ?? 3000);
app.listen(porta, () => {
  console.log(`MedProteg API rodando em http://localhost:${porta} (provedor: ${provedor.nome})`);
});
