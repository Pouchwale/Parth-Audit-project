// THE FORMULA LANGUAGE OF THE INDEXING MODULE.
//
// The super admin writes a formula the way Excel is written, and it is read here — never run as code (no eval, no
// Function): a formula can only add, compare and choose between the figures it is given.
//
//   numbers        12   0.5   -3
//   text           "Pass"   'Twice / Year'
//   figures        W  T  OVERALL  …  (each formula names its own; upper or lower case)
//   arithmetic     +  -  *  /  %  ( )
//   comparison     <  <=  >  >=  =  ==  <>  !=
//   logic          AND(a, b, …)  OR(a, b, …)  NOT(a)   also  &&  ||  !
//   choice         IF(condition, then, else)            also  condition ? then : else
//   functions      RAND()  ABS(x)  ROUND(x, places)  FLOOR(x)  CEIL(x)  MIN(a, b, …)  MAX(a, b, …)  SQRT(x)  POWER(x, y)
//
// A figure the formula does not know, a missing bracket or a word it cannot read is refused with the reason, before
// anything is saved.

export type FormulaValue = number | string | boolean;

type Node =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "var"; name: string }
  | { t: "un"; op: string; a: Node }
  | { t: "bin"; op: string; a: Node; b: Node }
  | { t: "cond"; c: Node; a: Node; b: Node }
  | { t: "call"; name: string; args: Node[] };

type Token = { k: "num"; v: number } | { k: "str"; v: string } | { k: "id"; v: string } | { k: "op"; v: string };

const FUNCTIONS: Record<string, { min: number; max: number }> = {
  RAND: { min: 0, max: 0 },
  IF: { min: 3, max: 3 },
  AND: { min: 1, max: 20 },
  OR: { min: 1, max: 20 },
  NOT: { min: 1, max: 1 },
  ABS: { min: 1, max: 1 },
  ROUND: { min: 1, max: 2 },
  FLOOR: { min: 1, max: 1 },
  CEIL: { min: 1, max: 1 },
  MIN: { min: 1, max: 20 },
  MAX: { min: 1, max: 20 },
  SQRT: { min: 1, max: 1 },
  POWER: { min: 2, max: 2 },
};

export const FORMULA_FUNCTIONS = Object.keys(FUNCTIONS);

class FormulaError extends Error { }

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new FormulaError(`Cannot read the number at "${src.slice(i, i + 8)}".`);
      out.push({ k: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      if (end === -1) throw new FormulaError("A text in quotes is not closed.");
      out.push({ k: "str", v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ k: "id", v: m[0].toUpperCase() });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "==", "!=", "<>", "&&", "||"].includes(two)) {
      out.push({ k: "op", v: two === "<>" ? "!=" : two === "==" ? "=" : two });
      i += 2;
      continue;
    }
    if ("+-*/%()<>=!,?:".includes(c)) {
      out.push({ k: "op", v: c });
      i++;
      continue;
    }
    throw new FormulaError(`The sign "${c}" cannot be used in a formula.`);
  }
  return out;
}

class Parser {
  private p = 0;
  constructor(private readonly tokens: Token[]) { }

  parse(): Node {
    if (this.tokens.length === 0) throw new FormulaError("The formula is empty.");
    const n = this.ternary();
    if (this.p < this.tokens.length) throw new FormulaError(`Unexpected "${this.show(this.tokens[this.p])}" in the formula.`);
    return n;
  }

  private show(t: Token): string {
    return String(t.v);
  }
  private peekOp(...ops: string[]): string | null {
    const t = this.tokens[this.p];
    return t && t.k === "op" && ops.includes(t.v) ? t.v : null;
  }
  private expect(op: string): void {
    if (!this.peekOp(op)) throw new FormulaError(`"${op}" is missing in the formula.`);
    this.p++;
  }

  private ternary(): Node {
    const c = this.or();
    if (this.peekOp("?")) {
      this.p++;
      const a = this.ternary();
      this.expect(":");
      const b = this.ternary();
      return { t: "cond", c, a, b };
    }
    return c;
  }
  private or(): Node {
    let a = this.and();
    while (this.peekOp("||")) {
      this.p++;
      a = { t: "bin", op: "||", a, b: this.and() };
    }
    return a;
  }
  private and(): Node {
    let a = this.compare();
    while (this.peekOp("&&")) {
      this.p++;
      a = { t: "bin", op: "&&", a, b: this.compare() };
    }
    return a;
  }
  private compare(): Node {
    let a = this.add();
    let op: string | null;
    while ((op = this.peekOp("<", "<=", ">", ">=", "=", "!="))) {
      this.p++;
      a = { t: "bin", op, a, b: this.add() };
    }
    return a;
  }
  private add(): Node {
    let a = this.mul();
    let op: string | null;
    while ((op = this.peekOp("+", "-"))) {
      this.p++;
      a = { t: "bin", op, a, b: this.mul() };
    }
    return a;
  }
  private mul(): Node {
    let a = this.unary();
    let op: string | null;
    while ((op = this.peekOp("*", "/", "%"))) {
      this.p++;
      a = { t: "bin", op, a, b: this.unary() };
    }
    return a;
  }
  private unary(): Node {
    const op = this.peekOp("-", "+", "!");
    if (op) {
      this.p++;
      return { t: "un", op, a: this.unary() };
    }
    return this.primary();
  }
  private primary(): Node {
    const t = this.tokens[this.p];
    if (!t) throw new FormulaError("The formula ends too early.");
    if (t.k === "num") {
      this.p++;
      return { t: "num", v: t.v };
    }
    if (t.k === "str") {
      this.p++;
      return { t: "str", v: t.v };
    }
    if (t.k === "id") {
      this.p++;
      if (t.v === "TRUE") return { t: "num", v: 1 };
      if (t.v === "FALSE") return { t: "num", v: 0 };
      if (this.peekOp("(")) {
        const spec = FUNCTIONS[t.v];
        if (!spec) throw new FormulaError(`"${t.v}" is not a function the formula knows. Use one of: ${FORMULA_FUNCTIONS.join(", ")}.`);
        this.p++;
        const args: Node[] = [];
        if (!this.peekOp(")")) {
          args.push(this.ternary());
          while (this.peekOp(",")) {
            this.p++;
            args.push(this.ternary());
          }
        }
        this.expect(")");
        if (args.length < spec.min || args.length > spec.max) throw new FormulaError(`${t.v} takes ${spec.min === spec.max ? spec.min : `${spec.min} to ${spec.max}`} value${spec.max === 1 ? "" : "s"}.`);
        return { t: "call", name: t.v, args };
      }
      return { t: "var", name: t.v };
    }
    if (t.v === "(") {
      this.p++;
      const n = this.ternary();
      this.expect(")");
      return n;
    }
    throw new FormulaError(`Unexpected "${t.v}" in the formula.`);
  }
}

const num = (v: FormulaValue): number => (typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : Number(v));
const truthy = (v: FormulaValue): boolean => (typeof v === "string" ? v !== "" : Boolean(num(v)));

function evaluate(n: Node, vars: Record<string, FormulaValue>): FormulaValue {
  switch (n.t) {
    case "num":
    case "str":
      return n.v;
    case "var": {
      const v = vars[n.name];
      if (v === undefined) throw new FormulaError(`The figure "${n.name}" has no value.`);
      return v;
    }
    case "un": {
      const a = evaluate(n.a, vars);
      return n.op === "-" ? -num(a) : n.op === "+" ? num(a) : !truthy(a);
    }
    case "cond":
      return truthy(evaluate(n.c, vars)) ? evaluate(n.a, vars) : evaluate(n.b, vars);
    case "bin": {
      if (n.op === "&&") return truthy(evaluate(n.a, vars)) && truthy(evaluate(n.b, vars));
      if (n.op === "||") return truthy(evaluate(n.a, vars)) || truthy(evaluate(n.b, vars));
      const a = evaluate(n.a, vars);
      const b = evaluate(n.b, vars);
      switch (n.op) {
        case "+":
          return typeof a === "string" || typeof b === "string" ? `${a}${b}` : num(a) + num(b);
        case "-":
          return num(a) - num(b);
        case "*":
          return num(a) * num(b);
        case "/":
          return num(a) / num(b);
        case "%":
          return num(a) % num(b);
        case "=":
          return typeof a === "string" || typeof b === "string" ? String(a) === String(b) : num(a) === num(b);
        case "!=":
          return typeof a === "string" || typeof b === "string" ? String(a) !== String(b) : num(a) !== num(b);
        case "<":
          return num(a) < num(b);
        case "<=":
          return num(a) <= num(b) + 1e-9;
        case ">":
          return num(a) > num(b);
        case ">=":
          return num(a) + 1e-9 >= num(b);
      }
      throw new FormulaError(`Unknown sign ${n.op}.`);
    }
    case "call": {
      const args = n.name === "IF" ? [] : n.args.map((a) => evaluate(a, vars));
      switch (n.name) {
        // Returns a new random decimal from 0 (inclusive) to 1 (exclusive).
        // RAND() takes no arguments and changes whenever the formula is evaluated.
        case "RAND":
          return Math.random();
        case "IF":
          return truthy(evaluate(n.args[0], vars)) ? evaluate(n.args[1], vars) : evaluate(n.args[2], vars);
        case "AND":
          return args.every(truthy);
        case "OR":
          return args.some(truthy);
        case "NOT":
          return !truthy(args[0]);
        case "ABS":
          return Math.abs(num(args[0]));
        case "ROUND": {
          const places = args.length > 1 ? Math.max(0, Math.min(10, Math.trunc(num(args[1])))) : 0;
          const f = 10 ** places;
          const x = num(args[0]) * f;
          return (Math.sign(x) * Math.round(Math.abs(x) + 1e-9)) / f;
        }
        case "FLOOR":
          return Math.floor(num(args[0]));
        case "CEIL":
          return Math.ceil(num(args[0]));
        case "MIN":
          return Math.min(...args.map(num));
        case "MAX":
          return Math.max(...args.map(num));
        case "SQRT":
          return Math.sqrt(num(args[0]));
        case "POWER":
          return num(args[0]) ** num(args[1]);
      }
      throw new FormulaError(`Unknown function ${n.name}.`);
    }
  }
}

function variablesOf(n: Node, into: Set<string>): Set<string> {
  switch (n.t) {
    case "var":
      into.add(n.name);
      break;
    case "un":
      variablesOf(n.a, into);
      break;
    case "bin":
      variablesOf(n.a, into);
      variablesOf(n.b, into);
      break;
    case "cond":
      variablesOf(n.c, into);
      variablesOf(n.a, into);
      variablesOf(n.b, into);
      break;
    case "call":
      n.args.forEach((a) => variablesOf(a, into));
      break;
  }
  return into;
}

export type CompiledFormula = (vars: Record<string, FormulaValue>) => FormulaValue;

export type CompileResult = { ok: true; run: CompiledFormula; uses: string[] } | { ok: false; error: string };

const cache = new Map<string, CompileResult>();

/**
 * Reads `source` once (cached by its text and the figures allowed) and hands back the way to work it out, or why it
 * cannot be read. `allowed` are the figures the formula may name; any other name is refused.
 */
export function compileFormula(source: string, allowed: readonly string[]): CompileResult {
  const key = `${allowed.join(",")}\u0000${source}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let result: CompileResult;
  try {
    const tree = new Parser(tokenize(String(source ?? ""))).parse();
    const uses = [...variablesOf(tree, new Set())];
    const known = new Set(allowed.map((a) => a.toUpperCase()));
    const unknown = uses.filter((u) => !known.has(u));
    if (unknown.length) {
      result = { ok: false, error: `This formula can only use ${allowed.length ? allowed.join(", ") : "numbers"}; "${unknown.join('", "')}" is not one of them.` };
    } else {
      result = {
        ok: true,
        uses,
        run: (vars) => {
          const upper: Record<string, FormulaValue> = {};
          for (const [k, v] of Object.entries(vars)) upper[k.toUpperCase()] = v;
          return evaluate(tree, upper);
        },
      };
    }
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, result);
  return result;
}

/** Works a formula out on the given figures; null when it cannot (no value, a division by nothing, not a number). */
export function runFormula(run: CompiledFormula, vars: Record<string, FormulaValue>): FormulaValue | null {
  try {
    const v = run(vars);
    if (typeof v === "number" && !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

/** A result as a number, or null when it is not one. */
export function asNumber(v: FormulaValue | null): number | null {
  if (v === null) return null;
  const n = typeof v === "boolean" ? (v ? 1 : 0) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A result as yes / no. */
export function asYes(v: FormulaValue | null): boolean | null {
  if (v === null) return null;
  return typeof v === "string" ? v !== "" && v.toLowerCase() !== "no" && v.toLowerCase() !== "false" : Boolean(asNumber(v));
}
