// Avaliação do analisador com documentos fictícios.
//
// Testes unitários conferem o código; isto aqui confere o comportamento do
// modelo. Sempre que o prompt mudar, rodar `npm run evals` e comparar.

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { analisarDocumento } from "./analyzer.ts";
import { provedorDoAmbiente } from "./llm.ts";

interface Caso {
  arquivo: string;
  contemDadosSensiveis: boolean;
  deveTerRiscoCom: string[];
  gravidadeMinima?: "baixa" | "media" | "alta";
  scoreMaximo?: number;
  scoreMinimo?: number;
}

const PESO = { baixa: 1, media: 2, alta: 3 } as const;
const pasta = new URL("../evals/", import.meta.url);
const casos: Caso[] = JSON.parse(await readFile(new URL("esperado.json", pasta), "utf8"));
const provedor = provedorDoAmbiente();

let aprovados = 0;
console.log(`Provedor: ${provedor.nome}\n`);

for (const caso of casos) {
  const texto = await readFile(new URL(`documentos/${caso.arquivo}`, pasta), "utf8");
  const falhas: string[] = [];

  try {
    const { analise } = await analisarDocumento(texto, provedor);

    if (analise.contemDadosSensiveis !== caso.contemDadosSensiveis) {
      falhas.push(`dados sensíveis: esperado ${caso.contemDadosSensiveis}`);
    }
    for (const categoria of caso.deveTerRiscoCom) {
      if (!analise.riscos.some((r) => r.categoria === categoria)) {
        falhas.push(`faltou risco "${categoria}"`);
      }
    }
    if (caso.gravidadeMinima) {
      const maior = Math.max(0, ...analise.riscos.map((r) => PESO[r.gravidade]));
      if (maior < PESO[caso.gravidadeMinima]) falhas.push(`gravidade abaixo de ${caso.gravidadeMinima}`);
    }
    if (caso.scoreMaximo !== undefined && analise.score > caso.scoreMaximo) {
      falhas.push(`score ${analise.score} > ${caso.scoreMaximo}`);
    }
    if (caso.scoreMinimo !== undefined && analise.score < caso.scoreMinimo) {
      falhas.push(`score ${analise.score} < ${caso.scoreMinimo}`);
    }
  } catch (erro) {
    falhas.push(erro instanceof Error ? erro.message : String(erro));
  }

  if (falhas.length === 0) aprovados++;
  console.log(`${falhas.length === 0 ? "OK   " : "FALHA"} ${caso.arquivo}${falhas.length ? " -> " + falhas.join("; ") : ""}`);
}

console.log(`\n${aprovados}/${casos.length} casos aprovados`);
process.exitCode = aprovados === casos.length ? 0 : 1;
