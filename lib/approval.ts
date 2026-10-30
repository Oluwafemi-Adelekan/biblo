/* An approval is a flow, not a form: one question at a time, each a
   plain yes or no that decides only the changes it names. The model
   writes the questions; any change it held back without asking about
   gets a question of its own here, so nothing is ever decided by a
   button that did not say what it was deciding. Shared by the server
   (building and applying) and the card (walking through it). */

/** One button on a question. Picking it either makes the change as
 *  proposed, makes it with a few fields swapped (set), or makes none
 *  of it (skip). "Car" and "Generator" are two options on one fuel. */
export type Option = {
  label: string;
  set?: { categoryId?: string; label?: string; amount?: number; date?: string; note?: string };
  skip?: boolean;
};

/** What a question was answered: an option's position, or the old
 *  plain yes and no. */
export type Answer = number | boolean;

export type Step = {
  question: string;
  detail?: string;
  /** The answers to offer; none means a plain yes and no. */
  options?: Option[];
  /** Positions in the proposal's arrays that this answer decides. */
  expenses: number[];
  edits: number[];
  deletes: number[];
  newCategories: number[];
  budget?: boolean;
};

type Budget = { month?: string; income?: number; caps?: Record<string, number> };

export type Proposal = {
  expenses: { label?: string; amount?: number; categoryId?: string; date?: string }[];
  edits: { id: string; set: Record<string, unknown> }[];
  deletes: string[];
  budget?: Budget;
  newCategories?: { name: string; cap?: number }[];
};

export type Names = {
  category: (id: string) => string;
  /** How an existing entry reads in a question, or undefined. */
  entry: (id: string) => string | undefined;
};

const naira = (v: number) => `₦${Math.round(Math.abs(v)).toLocaleString("en-NG")}`;
const none = (): Omit<Step, "question"> => ({ expenses: [], edits: [], deletes: [], newCategories: [] });

const YES_NO: Option[] = [{ label: "Yes" }, { label: "No", skip: true }];

/** The buttons a question shows. */
export function optionsOf(step: Step): Option[] {
  return step.options && step.options.length >= 2 ? step.options : YES_NO;
}

/** The option an answer picked, or undefined for a no. */
export function picked(step: Step, a: Answer | undefined): Option | undefined {
  if (a === undefined || a === false) return undefined;
  const opt = a === true ? optionsOf(step)[0] : optionsOf(step)[a];
  return opt && !opt.skip ? opt : undefined;
}

/** The old single card: one question that decides everything. */
export function allInOne(p: Proposal, question: string, detail?: string): Step {
  return {
    question,
    detail,
    expenses: p.expenses.map((_, i) => i),
    edits: p.edits.map((_, i) => i),
    deletes: p.deletes.map((_, i) => i),
    newCategories: (p.newCategories ?? []).map((_, i) => i),
    budget: p.budget ? true : undefined,
  };
}

function describe(set: Record<string, unknown>, names: Names) {
  const out: string[] = [];
  if (typeof set.amount === "number") out.push(`make it ${naira(set.amount)}`);
  if (typeof set.categoryId === "string") out.push(`move it to ${names.category(set.categoryId)}`);
  if (typeof set.label === "string") out.push(`call it "${set.label}"`);
  if (typeof set.date === "string") out.push(`date it ${set.date}`);
  if (Array.isArray(set.items)) out.push(`set its ${set.items.length} line items`);
  if (typeof set.note === "string") out.push("update its note");
  return out.join(", ") || "update it";
}

function budgetQuestion(b: Budget, names: Names) {
  const bits = [
    b.income !== undefined ? `income ${naira(b.income)}` : "",
    ...Object.entries(b.caps ?? {}).map(([k, v]) => `${names.category(k)} ${naira(v)}`),
  ].filter(Boolean);
  return `Set the ${b.month ?? ""} budget: ${bits.join(", ")}?`.replace("the  budget", "the budget");
}

/** The model's questions, kept to the changes they validly point at,
 *  then one question for every change no question covered. */
export function buildSteps(p: Proposal, asked: Step[], names: Names): Step[] {
  const seen = {
    expenses: new Set<number>(),
    edits: new Set<number>(),
    deletes: new Set<number>(),
    newCategories: new Set<number>(),
  };
  let budgetSeen = false;
  const keep = (xs: number[] | undefined, len: number, s: Set<number>) =>
    (xs ?? []).filter((i) => {
      if (!Number.isInteger(i) || i < 0 || i >= len || s.has(i)) return false;
      s.add(i);
      return true;
    });

  const steps: Step[] = [];
  for (const a of asked) {
    const st: Step = {
      question: a.question,
      detail: a.detail,
      options: a.options,
      expenses: keep(a.expenses, p.expenses.length, seen.expenses),
      edits: keep(a.edits, p.edits.length, seen.edits),
      deletes: keep(a.deletes, p.deletes.length, seen.deletes),
      newCategories: keep(a.newCategories, p.newCategories?.length ?? 0, seen.newCategories),
    };
    if (a.budget && p.budget && !budgetSeen) {
      st.budget = true;
      budgetSeen = true;
    }
    const size = st.expenses.length + st.edits.length + st.deletes.length + st.newCategories.length;
    if (size > 0 || st.budget) steps.push(st);
  }

  (p.newCategories ?? []).forEach((c, i) => {
    if (!seen.newCategories.has(i))
      steps.push({
        ...none(),
        newCategories: [i],
        question: `Add a new category, ${c.name}?`,
        options: [{ label: "Add it" }, { label: "Don't add it", skip: true }],
      });
  });
  p.expenses.forEach((e, i) => {
    if (!seen.expenses.has(i))
      steps.push({
        ...none(),
        expenses: [i],
        question: `File ${naira(Number(e.amount ?? 0))} for ${e.label ?? "this"} under ${names.category(e.categoryId ?? "")}?`,
        options: [{ label: "File it" }, { label: "Don't file it", skip: true }],
      });
  });
  p.edits.forEach((ed, i) => {
    if (!seen.edits.has(i))
      steps.push({
        ...none(),
        edits: [i],
        question: `Change ${names.entry(ed.id) ?? ed.id}: ${describe(ed.set, names)}?`,
        options: [{ label: "Change it" }, { label: "Keep it as is", skip: true }],
      });
  });
  p.deletes.forEach((id, i) => {
    if (!seen.deletes.has(i))
      steps.push({
        ...none(),
        deletes: [i],
        question: `Remove ${names.entry(id) ?? id}?`,
        options: [{ label: "Remove it" }, { label: "Keep it", skip: true }],
      });
  });
  if (p.budget && !budgetSeen)
    steps.push({
      ...none(),
      budget: true,
      question: budgetQuestion(p.budget, names),
      options: [{ label: "Set it" }, { label: "Keep the budget", skip: true }],
    });
  return steps;
}

/** Split what the model sent into what its questions hold back and
 *  what it was sure of, which is filed straight away. A new category
 *  that is itself in question holds everything, so nothing is ever
 *  filed into a category that may not come to exist. */
export function split<P extends Proposal>(p: P, asked: Step[]): { now: P; held: P; asked: Step[] } {
  const cover = {
    expenses: new Set(asked.flatMap((a) => a.expenses)),
    edits: new Set(asked.flatMap((a) => a.edits)),
    deletes: new Set(asked.flatMap((a) => a.deletes)),
    newCategories: new Set(asked.flatMap((a) => a.newCategories)),
  };
  if (cover.newCategories.size > 0 || asked.length === 0) {
    return { now: { ...p, expenses: [], edits: [], deletes: [], newCategories: [], budget: undefined }, held: p, asked };
  }
  const budgetHeld = asked.some((a) => a.budget);
  const part = <T,>(xs: T[], s: Set<number>, held: boolean) => xs.filter((_, i) => s.has(i) === held);
  const held = {
    ...p,
    expenses: part(p.expenses, cover.expenses, true),
    edits: part(p.edits, cover.edits, true),
    deletes: part(p.deletes, cover.deletes, true),
    newCategories: [],
    budget: budgetHeld ? p.budget : undefined,
  } as P;
  const now = {
    ...p,
    expenses: part(p.expenses, cover.expenses, false),
    edits: part(p.edits, cover.edits, false),
    deletes: part(p.deletes, cover.deletes, false),
    budget: budgetHeld ? undefined : p.budget,
  } as P;
  // Positions move once the held changes stand on their own.
  const remap = (xs: number[], s: Set<number>) => {
    const order = [...s].sort((a, b) => a - b);
    return xs.map((i) => order.indexOf(i)).filter((i) => i >= 0);
  };
  return {
    now,
    held,
    asked: asked.map((a) => ({
      ...a,
      expenses: remap(a.expenses, cover.expenses),
      edits: remap(a.edits, cover.edits),
      deletes: remap(a.deletes, cover.deletes),
      newCategories: [],
    })),
  };
}

/** Only the changes whose question was answered with something other
 *  than a no, each with the fields its chosen option swaps in. */
export function chosen<P extends Proposal>(p: P, steps: Step[], answers: Answer[]): P {
  const yes = steps.filter((s, i) => picked(s, answers[i]));
  const has = (key: "expenses" | "edits" | "deletes" | "newCategories", i: number) =>
    yes.some((s) => s[key].includes(i));
  const swap = (key: "expenses" | "edits", i: number) => {
    const at = steps.findIndex((s, n) => s[key].includes(i) && picked(s, answers[n]));
    return at < 0 ? undefined : picked(steps[at], answers[at])?.set;
  };
  const clean = (set: Option["set"]) =>
    Object.fromEntries(Object.entries(set ?? {}).filter(([, v]) => v !== undefined && v !== ""));
  return {
    ...p,
    expenses: p.expenses
      .map((e, i) => ({ e, i }))
      .filter(({ i }) => has("expenses", i))
      .map(({ e, i }) => ({ ...e, ...clean(swap("expenses", i)) })),
    edits: p.edits
      .map((ed, i) => ({ ed, i }))
      .filter(({ i }) => has("edits", i))
      .map(({ ed, i }) => ({ ...ed, set: { ...ed.set, ...clean(swap("edits", i)) } })),
    deletes: p.deletes.filter((_, i) => has("deletes", i)),
    newCategories: (p.newCategories ?? []).filter((_, i) => has("newCategories", i)),
    budget: yes.some((s) => s.budget) ? p.budget : undefined,
  };
}

export function isEmpty(p: Proposal) {
  return (
    p.expenses.length + p.edits.length + p.deletes.length + (p.newCategories?.length ?? 0) === 0 && !p.budget
  );
}
