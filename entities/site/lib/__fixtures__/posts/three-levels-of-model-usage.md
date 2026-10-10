# The 3 Levels of AI Model Usage

**Author:** Dave Hajdu | **Published:** August 2026 | **Read time:** 6 min  
**Category:** Operations

---

Every week I talk with founders and CTOs who are somewhere on the same journey: they know their company should be using AI models seriously, but they can't quite name where they are or what the next step costs. When you sit down to choose an AI model setup for your business, the options blur together. So here is the map I draw on the whiteboard. Three levels, each with a real tradeoff, and a clear answer to the question "where should we be?"

One note before we start. This ladder is about where and how you run models, not how good you are at using them. A team at Level One can outperform a team at Level Three. In fact, most do.

## Level One: Everything in Claude

At Level One, your team works inside a single AI platform's own applications. In our case that's Claude: the chat app, the desktop app, Claude Code for technical work. No custom infrastructure, no API keys, nothing to maintain.

People dismiss this level as "just using the app." That's a mistake, because the real work at Level One is learning the two dials that matter:

**Model types.** Every provider ships a family of models at different capability and price points. Claude currently spans from Haiku, fast and cheap, through Sonnet and Opus, up to Fable 5 at the top. Knowing which tier fits which job is a skill, and it transfers everywhere.

**Effort levels.** The newer models let you set how hard they think: low, medium, high. Planning a strategy deserves high effort on a top model. Summarizing a meeting doesn't. Teams that never touch this dial overpay on every task or underpower the ones that count.

What you give up at Level One is choice. You're inside one vendor's ecosystem, on their tools, at their pace.

The honest truth: most companies should master this level before touching the next one, and many never need to leave it. The constraint at Level One is almost never the platform. It's how well your people use it.

## Level Two: An IDE and any model you want

At Level Two, your team works through development environments and API access. An IDE, an integrated development environment, is the workbench developers write software in, and modern ones like Cursor or VS Code let you plug in any model from any provider: Anthropic, OpenAI, Google, all of them, switchable per task.

This is where optimization lives. You can route each job to the best model for it: one model for planning, a cheaper one for execution, a specialist for code. You can automate workflows, chain models together, and tune cost per task in ways Level One doesn't allow. For a technical team, the gains are real.

The tradeoff is just as real: data privacy and control get harder. At Level One, one vendor sees your data under one agreement. At Level Two, your data flows to multiple providers under multiple agreements, through API keys that need managing, with logging and retention policies that differ by vendor. Every additional provider is another place your customer data, financials, or product plans might travel. Most companies discover this gap in a security review, after the workflows are already built.

Level Two makes sense when you have technical staff, real volume, and someone explicitly responsible for governance: who can use which model, with what data, under what agreement. If nobody owns that question, you're not ready for this level. You're just at Level One with extra risk.

## Level Three: Open-weight models you host yourself

At Level Three, you run the models on infrastructure you control. Open-weight models are models whose trained parameters, the "weights," are published so anyone can download and run them. <a href="https://www.llama.com/" target="_blank" rel="noopener">Meta's Llama family</a> and Mistral's models are the best-known examples.

Why would anyone take this on? Control. Your data never leaves your infrastructure, which matters enormously in healthcare, finance, defense, and any business handling data that regulators or customers say cannot travel. I've written before about [open-weight models and enterprise data security](/post/open-weight-ai-models-enterprise-data-security-2025/), and about [running AI offline at the enterprise edge](/post/offline-ai-real-time-enterprise-edge/): both are Level Three stories. You're immune to a vendor deprecating the model your workflows depend on, and at very high volume, running your own can beat paying per token.

The cost is that you just became an AI infrastructure company. GPU hardware or cloud GPU commitments, engineers who can deploy and monitor models, security hardening, and a hard truth on quality: open-weight models trail the frontier. The best models in the world are not open-weight, so you're accepting a capability gap in exchange for control.

Level Three is the right call for a narrow set of companies with regulatory mandates, extreme scale, or genuine sovereignty requirements. For everyone else it's an expensive way to feel in control while your competitors ship faster on better models.

<figure class="post-figure">

![A balance scale trading a solid cube labeled simplicity against a wireframe cube labeled control](/blog/images/simplicity-for-control.webp)

<figcaption><strong>Exhibit 1.</strong> Every level up the ladder trades simplicity for control. Climb only when a constraint forces it. <span class="fig-source">Source: Edge8 analysis.</span></figcaption>

</figure>

## Where should you be?

When you choose an AI model setup, three questions settle it:

1. Can your data legally and contractually leave your infrastructure? If no, Level Three isn't a preference, it's a requirement. If yes, keep reading.
2. Do you have technical staff and an owner for AI governance? If no, stay at Level One and master it. If yes, Level Two is open to you.
3. Is your team actually good at Level One? Model selection, effort levels, clear problem framing. If not, moving up the ladder multiplies confusion, not capability.

Notice the pattern: the ladder isn't a maturity contest. Climbing it trades simplicity for control, and you should climb only when a specific constraint forces you to.

One more thing the ladder can't fix. The skills that matter most, knowing what you want, framing problems clearly, matching models to jobs, live inside your people at every level. Models keep changing, and the way you work with them has to change too. The old habits, including [the prompts your team wrote for last year's models, quietly expire](/post/your-prompts-are-expiring/) as new generations ship. I wrote a separate piece on that, because it catches almost everyone off guard.

## The staffing angle

Each level has a talent profile. Level One needs trained operators: people who know the models and use them well, which is a training problem more than a hiring problem. Level Two needs engineers plus a governance owner. Level Three needs infrastructure and ML engineers, and they are among the hardest hires in the market right now. Whichever level you land on, someone has to own the program: that's [why AI leadership trumps technology](/post/why-every-business-needs-a-chief-ai-officer-leadership-trumps-technology/).

Most companies we meet are trying to hire for the level above the one they've mastered. The cheaper move is usually to get great at the level you're on, and hire for the next one only when a real constraint, not ambition, forces the climb.

If you're weighing where your company should sit and who you'd need to get there, [book a conversation with us](/contact/). We'll talk through your business and how AI will give you the leverage you need to 8x.

## Frequently asked questions about choosing an AI model setup

<details class="faq-item">
<summary>How should a business choose an AI model setup?</summary>

Ask three questions in order. First, can your data legally leave your infrastructure? If not, you need self-hosted open-weight models. Second, do you have technical staff and a named owner for AI governance? If not, work inside a single vendor's applications. Third, has your team mastered model selection and effort levels where you are now? Only climb to the next level when a specific constraint forces it.

</details>

<details class="faq-item">
<summary>What are the 3 levels of AI model usage?</summary>

Level One is working entirely inside one vendor's applications, such as Claude's apps, and mastering model types and effort levels. Level Two is using development environments and APIs to route tasks to any model from any provider. Level Three is hosting open-weight models on your own infrastructure for full data control.

</details>

<details class="faq-item">
<summary>What are open-weight AI models?</summary>

Models whose trained parameters, called weights, are published so anyone can download and run them on their own hardware. Meta's Llama family and Mistral's models are well-known examples. They offer control and data sovereignty but trail the best closed frontier models in capability.

</details>

<details class="faq-item">
<summary>Is it worth self-hosting AI models?</summary>

Only for a narrow set of companies: those with regulatory mandates that data cannot leave their infrastructure, extreme usage volume, or genuine sovereignty requirements. Self-hosting means taking on GPU infrastructure, ML engineering hires, and a capability gap versus frontier models.

</details>

<details class="faq-item">
<summary>What is the main risk of using multiple AI providers through APIs?</summary>

Data privacy and governance. Company data flows to multiple vendors under different agreements, retention policies, and logging practices. Without a named owner deciding who can use which model with what data, API access adds risk faster than it adds capability.

</details>
