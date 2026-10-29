// Camada de acesso ao modelo. Fica isolada para dar para trocar de provedor
// sem mexer no resto (e para rodar os testes sem chave de API).

export interface Mensagem {
  sistema: string;
  usuario: string;
}

export interface ProvedorLLM {
  nome: string;
  gerarJson(msg: Mensagem): Promise<string>;
}

/** Google Gemini via API REST (tem plano gratuito, bom para projeto de estudante). */
export function gemini(apiKey: string, modelo = "gemini-2.5-flash"): ProvedorLLM {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

  return {
    nome: `gemini:${modelo}`,
    async gerarJson({ sistema, usuario }) {
      // 429 (limite) e 503 (modelo sobrecarregado) costumam passar sozinhos:
      // espera 2s, 4s e 8s antes de desistir
      for (let tentativa = 1; ; tentativa++) {
        const resposta = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          signal: AbortSignal.timeout(60_000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sistema }] },
            contents: [{ role: "user", parts: [{ text: usuario }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
          }),
        });

        if ((resposta.status === 429 || resposta.status === 503) && tentativa <= 3) {
          const espera = 2 ** tentativa * 1000;
          console.warn(`Gemini respondeu ${resposta.status}; tentando de novo em ${espera / 1000}s`);
          await new Promise((r) => setTimeout(r, espera));
          continue;
        }

        if (!resposta.ok) {
          throw new Error(`Gemini respondeu ${resposta.status}: ${await resposta.text()}`);
        }

        const dados = (await resposta.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const texto = dados.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!texto) throw new Error("Resposta do Gemini veio vazia");
        return texto;
      }
    },
  };
}

/**
 * Provedor falso, sem IA: monta uma análise simples a partir dos marcadores.
 * Serve para rodar o projeto e os testes sem chave de API.
 */
export function mock(): ProvedorLLM {
  return {
    nome: "mock",
    async gerarJson({ usuario }) {
      const marcadores = usuario.match(/\[[A-Z_]+_\d+\]/g) ?? [];
      const temSaude = /CID|diagn[óo]stic|prontu[áa]rio|exame/i.test(usuario);
      const riscos = [];
      if (marcadores.length > 0) {
        riscos.push({
          categoria: "lgpd",
          descricao: `Documento contém ${marcadores.length} dado(s) pessoal(is) identificável(is).`,
          gravidade: temSaude ? "alta" : "media",
          fundamento: temSaude ? "LGPD, art. 11" : "LGPD, art. 7º",
        });
      }
      return JSON.stringify({
        tipoDocumento: temSaude ? "Documento clínico" : "Documento administrativo",
        resumo: "Análise gerada pelo modo de teste (sem IA).",
        contemDadosSensiveis: temSaude,
        riscos,
        recomendacoes: riscos.length ? ["Restringir o acesso ao documento a quem precisa dele."] : [],
        score: Math.max(0, 100 - riscos.length * (temSaude ? 40 : 20)),
      });
    },
  };
}

export function provedorDoAmbiente(): ProvedorLLM {
  const chave = process.env.GEMINI_API_KEY;
  if (chave) return gemini(chave, process.env.GEMINI_MODEL);
  console.warn("GEMINI_API_KEY não definida: usando o modo mock (sem IA).");
  return mock();
}