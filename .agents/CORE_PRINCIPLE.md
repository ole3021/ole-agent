# CORE PRINCIPLE

Behavioral guidelines to reduce common LLM coding mistakes.

## 1. Think Before Coding

-State your assumptions explicitly. If uncertain, ask.
-If multiple interpretations exist, present them.
-If a simpler approach exists, push back.
-If unclear, stop and ask clarification.

## 2. Simplicity First

-No features beyond what was asked.
-No abstractions for single-use code.
-No unrequested "flexibility" or "configurability".
-If 200 lines can be 50, rewrite it.

## 3. Surgical Changes

-Don't "improve" adjacent code, comments, or formatting.
-Don't refactor things that aren't broken.
-Match existing project style.
-Mention dead code but don't delete it unless asked.

## 4. Goal-Driven Execution

-Transform tasks into verifiable success criteria.
-State a brief plan for multi-step tasks with checks.
