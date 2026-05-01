export const KEYWORD_PROMPT = `You are extracting search terms from a software ticket. Reply with a JSON array of up to 10 strings — function names, file fragments, error messages, entity nouns. Lowercase, no punctuation, no duplicates. Reply ONLY with the JSON array.

Title: {title}
Description: {description}

JSON:`

export const PREP_PROMPT = `You are preparing a customer ticket for a developer. Read the title and description and reply with a JSON object with exactly these keys:
{
  "summary": "<1-2 sentence plain-English summary of what the customer wants>",
  "intent": "<implicit goal or watch-fors the dev should know>",
  "open_questions": ["<ambiguity 1>", "<ambiguity 2>"]
}
Reply ONLY with the JSON object, no preface, no code fence.

Title: {title}
Description: {description}

JSON:`

export const RERANK_PROMPT = `You are picking the most relevant files for a software ticket. Given the candidate file paths and previews below, reply with a JSON array of up to 5 entries:
[
  { "path": "<exact path from candidates>", "why": "<one-line rationale>" }
]
Reply ONLY with the JSON array.

Ticket:
{title}
{description}

Candidates:
{candidates}

JSON:`
