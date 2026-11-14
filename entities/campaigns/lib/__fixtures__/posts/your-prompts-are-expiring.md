# Your Prompts Are Expiring

**Author:** Dave Hajdu | **Published:** August 2026 | **Read time:** 5 min  
**Category:** Innovation

---

If your company spent the last two years building a prompt library, I have uncomfortable news: a lot of it is already obsolete. Not because your team did anything wrong. Because the models got better.

That sentence sounds backwards, so let me show you exactly what I mean.

## The upgrade that broke the playbook

The newest generation of frontier models, Claude Fable 5 and Opus 5, automatically verify their own work. You give them a task, they do it, they check it, they correct themselves. That behavior is built in now.

Two years ago it wasn't. So every careful AI operator, myself included, wrote prompts that compensated: "Work step by step. After each step, verify your output. Check your work before continuing."

Run those same prompts on the new models and something strange happens. The model verifies its work because you told it to, and then verifies again because that's what it does by default. Your instructions push it into long, redundant checking loops. Tasks that should take one pass take five. You pay for every one of those passes, in time and in tokens.

Read that again: the prompt failed because the model improved. The instruction was a crutch for a weakness that no longer exists, and now the crutch is tripping the runner. This has happened with [every model generation that changed how prompting works](/post/gpt-41-changes-everything-ai-prompting/); the new models just made it impossible to ignore.

## Prompts are workarounds, and workarounds expire

This is the pattern underneath the example, and it's the part most companies miss.

A prompt is not knowledge. A prompt is a workaround: a set of instructions that compensates for what a specific model, at a specific moment, couldn't do on its own. Step-by-step scaffolding compensated for weak reasoning. "Verify your work" compensated for sloppiness. Elaborate role-play framing compensated for models that lost the thread.

Every model generation absorbs some of those weaknesses. Which means every model generation silently invalidates some of your workarounds. The prompt library, the step-by-step SOPs, the "proven templates" your team laminated and shared in Slack: all of it is inventory with an expiry date printed in invisible ink.

Most companies treat that inventory as an appreciating asset. They audit it, document it, train new hires on it. They are maintaining a depreciating one.

<figure class="post-figure">

![Two curves over time: prompt libraries step down in value at every model release while judgment compounds upward](/blog/images/prompts-expire-judgment-compounds.webp)

<figcaption><strong>Exhibit 1.</strong> Every model release marks down the prompt library. Judgment only compounds. <span class="fig-source">Source: Edge8 analysis.</span></figcaption>

</figure>

## What actually compounds

So if the prompts expire, what holds its value? In my own work, three things have survived every model transition. None of them are prompts.

### 1. Knowing which model does which job

I don't use one model for everything. I use Fable 5, the top-tier model, for planning and thinking. It's a genuine thinking partner: I bring it a problem, we work out what should be built and how. Then I hand the execution to Opus 4.8, a cheaper and faster model, to do the work quickly.

The expensive model designs the work. The lesser model does the work. That division of labor is a judgment call, not a prompt, and it carries forward no matter what ships next quarter.

Same with effort settings. The new models let you dial reasoning effort up or down. Medium is my default, and for thinking-partner conversations I often go lower. Most teams never touch the dial and overpay for every conversation.

### 2. Giving the model problems, not procedures

The old instinct was to write procedures: do this, then this, then this. The new models do their best work when you give them a goal, a few examples, and room to move.

Instead of dictating steps, I describe the problem I'm trying to solve. I'll ask the model to draw on best-in-class products, or to apply a real business framework: <a href="https://www.christenseninstitute.org/theory/jobs-to-be-done/" target="_blank" rel="noopener">Jobs to Be Done</a>, the framework Clayton Christensen taught at Harvard Business School, is one I reach for often. Given that kind of direction and the freedom to work, the model regularly comes back with approaches smarter than the procedure I would have written.

Notice what's durable here. The framework is decades old. The habit of framing problems clearly is older than that. Neither one expires when a model updates. Your procedures do.

### 3. Spending your time on planning, not prompting

Here's the shift that surprised me most: I spend almost no time on prompting anymore. The hours I used to spend engineering instructions now go into thinking deeply about what I actually want done.

That's the real skill behind using higher-end models well. Use the best model to help you plan. Think hard about the outcome, the constraints, what good looks like. Once the plan is sharp, a lesser model can execute it fast and cheap. Vague goal plus perfect prompt loses to sharp goal plus no prompt at all, every time.

Where you run those models, one vendor's apps or your own infrastructure, is the other half of this decision. I've mapped that out in [the 3 levels of AI model usage](/post/three-levels-of-model-usage/).

## The talent implication

Now follow this to its logical end, because it changes who you hire.

In 2024, companies raced to hire prompt engineers. The pitch was that prompting was the new literacy, and the people who mastered it would be indispensable. But prompting skill is exactly the thing each model generation absorbs. The models keep getting better at understanding plain intent, which means the gap that prompt engineering filled keeps shrinking. Hiring for it is hiring for a depreciating skill.

What you want instead are people with the three durable skills above: judgment about which model fits which job, the ability to frame business problems clearly, and the discipline to plan before they delegate. Those people get more valuable with every model release, because every release gives their judgment more leverage. It's the same reason [AI leadership beats AI technology](/post/why-every-business-needs-a-chief-ai-officer-leadership-trumps-technology/): the durable advantage lives in people who direct the tools, not in the tools.

When we help companies with AI talent at Edge8, this is now one of the first filters we apply. Not "show me your prompts." Instead: "show me how you decide what the model should do, and how you know it did it well."

## What to do this quarter

Three moves, none of them expensive:

1. Audit your prompt library against the current models. Anything with step-by-step verification scaffolding is a candidate for deletion, not preservation. Shorter will often work better.
2. When a new model generation ships, treat it as a breaking change. Re-test your critical AI workflows the way you'd re-test code after a major dependency upgrade.
3. Rebalance what your team practices. Less prompt-craft, more problem-framing, model selection, and planning. This is the difference between [building an AI program and collecting AI tools](/post/ai-program-vs-ai-tool/).

The companies that win with AI won't be the ones with the biggest prompt libraries. They'll be the ones whose people know what they want, know which model to hand it to, and re-tune fastest when the ground moves.

If you want a second set of eyes on how your team is set up for that, [book a conversation with us](/contact/). We'll talk through your business and how AI will give you the leverage you need to 8x.

## Frequently asked questions about expiring prompts

<details class="faq-item">
<summary>Why does an AI prompt library stop working when models improve?</summary>

Prompts are workarounds for a specific model's weaknesses at a specific time. When a new model generation absorbs those weaknesses, the workaround instructions become redundant or counterproductive. For example, models like Claude Fable 5 and Opus 5 verify their own work automatically, so older prompts that command step-by-step verification push them into slow, redundant checking loops.

</details>

<details class="faq-item">
<summary>Is prompt engineering becoming obsolete?</summary>

The narrow skill of crafting elaborate instructions is depreciating, because each model generation gets better at understanding plain intent. The durable skills are problem framing, choosing the right model and effort level for each job, and planning work clearly before delegating it to a model.

</details>

<details class="faq-item">
<summary>What should teams do with existing prompts after a model upgrade?</summary>

Treat a new model generation as a breaking change. Re-test critical AI workflows the way you would re-test software after a major dependency upgrade, and delete verification and step-by-step scaffolding that the new models handle natively. Shorter prompts often perform better on newer models.

</details>

<details class="faq-item">
<summary>What skills should companies hire for instead of prompt engineering?</summary>

Judgment about which model fits which job, the ability to frame business problems clearly, and planning discipline. These skills gain value with every model release, while prompt-specific technique loses value.

</details>
