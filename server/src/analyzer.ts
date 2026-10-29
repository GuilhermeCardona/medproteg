import { pseudonimizar, type ResultadoPseudonimizacao } from "./pii.ts";
import { PROMPT_SISTEMA, montarPromptUsuario } from "./prompt.ts";
import { AnaliseSchema, type Analise } from "./schema.ts";
import type { ProvedorLLM } from "./llm.ts";

export const LIMITE_CARACTERES = 30_000;

export interface ResultadoAnalise {
  analise: Analise;
  dadosPessoais: Pick<ResultadoPseudonimizacao, "contagem" | "codigosCid">;
  provedor: string;
  tentativas: number;
}

export async function analisarDocumento(
  texto: string,
  provedor: ProvedorLLM,
  descricao?: string,
): Promise<ResultadoAnalise> {
  if (!texto.trim()) throw new Error("Documento vazio");
  if (texto.length > LIMITE_CARACTERES) {
    throw new Error(`Documento muito grande (máximo de ${LIMITE_CARACTERES} caracteres)`);
  }

  // 1. Tira os dados pessoais antes de mandar para fora
  const pii = pseudonimizar(texto);

  // 2. Chama o modelo e valida a resposta. Se vier fora do formato, manda o
  //    erro de volta e pede para corrigir (no máximo 2 tentativas).
  const usuario = montarPromptUsuario(pii.texto, descricao);
  let ultimoErro = "";

  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const msgUsuario = ultimoErro
      ? `${usuario}\n\nSua resposta anterior foi inválida (${ultimoErro}). Responda só com o JSON no formato pedido.`
      : usuario;

    const bruto = await provedor.gerarJson({ sistema: PROMPT_SISTEMA, usuario: msgUsuario });

    let json: unknown;
    try {
      json = JSON.parse(limparCercaMarkdown(bruto));
    } catch {
      ultimoErro = "JSON malformado";
      continue;
    }

    const validacao = AnaliseSchema.safeParse(json);
    if (validacao.success) {
      return {
        analise: ajustarComDeteccaoLocal(validacao.data, pii),
        dadosPessoais: { contagem: pii.contagem, codigosCid: pii.codigosCid },
        provedor: provedor.nome,
        tentativas: tentativa,
      };
    }
    ultimoErro = validacao.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
  }

  throw new Error(`O modelo não devolveu uma análise válida: ${ultimoErro}`);
}

/** Alguns modelos embrulham o JSON em ```json ... ``` mesmo quando pedimos que não. */
function limparCercaMarkdown(texto: string): string {
  return texto.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
}

/**
 * A detecção local é determinística; o modelo não. Se achamos código CID no
 * texto, o documento tem dado de saúde, mesmo que o modelo diga o contrário.
 */
function ajustarComDeteccaoLocal(analise: Analise, pii: ResultadoPseudonimizacao): Analise {
  if (pii.codigosCid.length > 0 && !analise.contemDadosSensiveis) {
    return { ...analise, contemDadosSensiveis: true };
  }
  return analise;
}
