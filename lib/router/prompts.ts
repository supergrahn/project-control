export const COMPLEXITY_PROMPT = `You are a task complexity classifier. Read the task title and description and reply with EXACTLY ONE of these tokens, lowercase, no other text:

trivial — small, mechanical, low-judgment work (rename, format, copy edit, single-file tweak)
normal  — typical multi-step feature/bugfix that touches a handful of files
hard    — multi-system change, deep refactor, ambiguous requirements, design or research-heavy

Title: {title}
Description: {description}

Reply:`
