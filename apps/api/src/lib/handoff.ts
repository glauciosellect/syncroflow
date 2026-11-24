// Detecta, na resposta do agente de IA, que ele prometeu passar o atendimento para um humano
// ("vou transferir", "vou avisar o responsável", "nossa equipe entrará em contato"...).
// Quando isso acontece a conversa precisa ir imediatamente para "Aguardando humano".

const HANDOFF_PATTERNS: RegExp[] = [
  // "vou transferir / encaminhar / passar / repassar (você|a conversa|seu caso)..."
  /\b(vou|irei|iremos|vamos|j[aá]\s+vou|estou|estamos)\s+(te\s+|lhe\s+|voc[eê]\s+)?(transferir|transferindo|encaminhar|encaminhando|repassar|repassando|passar\s+(voc[eê]|a\s+conversa|o\s+atendimento|seu\s+caso|para))\b/i,
  // "transferindo você / a ligação / a chamada"
  /\btransferindo\s+(voc[eê]|a\s+(conversa|chamada|liga[cç][aã]o)|o\s+atendimento)\b/i,
  // "vou avisar / acionar / chamar o responsável / atendente / equipe..."
  /\b(vou|irei|vamos|j[aá]\s+vou)\s+(avisar|acionar|chamar|notificar|comunicar|alertar)\s+(o|a|os|as|nosso|nossa|um|uma|algu[eé]m|a\s+equipe)?\s*(respons[aá]vel|atendente|equipe|time|especialista|advogad\w+|consultor\w*|gerente|humano|setor|dono|propriet[aá]rio|comercial)/i,
  // "um atendente / especialista vai entrar em contato / assumir / te atender"
  /\b(um|uma|o|a|nosso|nossa)\s+(atendente|especialista|consultor\w*|advogad\w+|humano|respons[aá]vel|gerente|vendedor\w*|membro\s+da\s+equipe)\s+(vai|ir[aá]|poder[aá]|entrar[aá])\s+(entrar\s+em\s+contato|te\s+atender|lhe\s+atender|falar\s+com\s+voc[eê]|assumir|continuar|dar\s+continuidade|retornar)/i,
  // "nossa equipe vai entrar em contato / retornar"
  /\b(nossa\s+equipe|o\s+time|a\s+equipe)\s+(vai|ir[aá]|entrar[aá]|retornar[aá])\s+(entrar\s+em\s+contato|retornar|te\s+chamar|falar\s+com\s+voc[eê]|dar\s+continuidade)/i,
  // "aguarde, (um|nosso) atendente..." / "aguarde um momento que vou chamar"
  /\baguarde\b.{0,60}\b(atendente|especialista|respons[aá]vel|equipe|humano)\b/i,
]

export function aiPromisedHandoff(text: string | null | undefined): boolean {
  if (!text) return false
  const t = text.replace(/\s+/g, ' ')
  return HANDOFF_PATTERNS.some((re) => re.test(t))
}
