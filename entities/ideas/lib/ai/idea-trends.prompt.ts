import { definePrompt } from "@/kernel/ai/prompts";

// The idea-trends site's prompt (Z.6.1). Its version is a hash of this text,
// recorded on every ai_calls row.
//
// The site sends no system prompt: the instruction has always opened the user
// message, followed by a blank line and one material line per spark (built in
// ./idea-trends from the rows). So the prompt is a user template only, with
// the material lines in {{material}}, which keeps the request exactly what it
// was.
export const IDEA_TRENDS_PROMPT = definePrompt("idea-trends", {
  user:
    "Below are the sparks a small team posted: ideas to build and lessons they learned, each with a ref (s1…) and an author ref (p1…). " +
    "Group them into themes: sparks that say the same thing or touch the same subject. Rules: " +
    "a build theme holds only build sparks in ideaIds and a learning theme only learning sparks; put sparks of the other kind on the same subject in relatedIds. " +
    "A theme needs at least two sparks from at least two different authors; leave out sparks that share no theme. " +
    "In repeats, pair two sparks by different authors that ask for the same thing in different words, with a 2-5 word label. " +
    "Title: the subject in plain words. Gist: one plain sentence on what the sparks have in common, in the team's voice, never naming people. " +
    "At most six themes of each kind. Use only the refs given." +
    "\n\n{{material}}",
});
