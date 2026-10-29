import { z } from "zod";

// Formato que o modelo é obrigado a devolver. Se a resposta não bater com
// este schema, o analisador pede uma correção (ver analyzer.ts).

export const RiscoSchema = z.object({
  categoria: z.enum(["lgpd", "contratual", "sanitaria", "seguranca"]),
  descricao: z.string().min(1),
  gravidade: z.enum(["baixa", "media", "alta"]),
  fundamento: z.string().optional(), // ex.: "LGPD, art. 11"
});

export const AnaliseSchema = z.object({
  tipoDocumento: z.string().min(1),
  resumo: z.string().min(1),
  contemDadosSensiveis: z.boolean(),
  riscos: z.array(RiscoSchema),
  recomendacoes: z.array(z.string()),
  score: z.number().int().min(0).max(100), // 100 = totalmente em conformidade
});

export type Analise = z.infer<typeof AnaliseSchema>;
export type Risco = z.infer<typeof RiscoSchema>;
