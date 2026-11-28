// Ten questions a member can pull into "What I want to talk about" (K.24). They
// live in code rather than a table because nobody edits them per company and a
// table would buy an admin screen nobody asked for. The four groups follow the
// shape of the well-known first-1-1 question sets — career, workload, feedback,
// the company — but the wording is ours, and each one is a sentence a member
// could paste into the field as it stands.

export type QuestionGroup = {
  /** The heading shown above the group in the prompt list. */
  title: string;
  questions: string[];
};

export const QUESTION_LIBRARY: QuestionGroup[] = [
  {
    title: "Career",
    questions: [
      "What would the next step up look like for me, and what is missing today?",
      "Which part of my work should I be getting better at this quarter?",
      "Is there a piece of work coming up that would stretch me in the right direction?",
    ],
  },
  {
    title: "Workload",
    questions: [
      "Am I spending my time on the things that matter most right now?",
      "What should I drop or hand over so the important thing moves faster?",
      "Which of my current commitments is most at risk, and does that worry you too?",
    ],
  },
  {
    title: "Feedback",
    questions: [
      "What is one thing I did recently that you would want me to do again?",
      "Where do you think I am misreading a situation or a person?",
    ],
  },
  {
    title: "The company",
    questions: [
      "What is changing in the company that I should be paying attention to?",
      "Which decision being made above me will affect my work the most?",
    ],
  },
];
