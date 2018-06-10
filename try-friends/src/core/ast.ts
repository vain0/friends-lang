/*!
 * Abstract syntax tree (AST).
 */

/**
 * Predicate.
 */
export type Pred = string;

/**
 * Atom. Identified by name.
 */
export type Atom = string;

export type VarId = number;

/**
 * Variable: a symbol to unify.
 */
export interface Var {
  varId: VarId;
  varName: string;
}

/**
 * Term: an expression to represent an object.
 */
export type Term =
  | VarTerm
  | AtomTerm
  | AppTerm
  ;

export interface VarTerm {
  var: Var;
}

/**
 * Atom: a constant.
 */
export interface AtomTerm {
  atom: Atom;
}

export const nilTerm = {
  atom: 'nil',
};

/**
 * Application term: a node to compose atoms and variables into one term.
 */
export interface AppTerm {
  f: Atom;
  x: Term;
}

/**
 * Proposition: an expression to represent a statement.
 */
export type Prop =
  | PredProp
  | ConjProp
  ;

/**
 * Proposition which consists of a predicate.
 */
export interface PredProp {
  pred: Pred;
  term: Term;
}

export interface ConjProp {
  left: Prop;
  right: Prop;
}

// FIXME: Should be a predicate.
/**
 * '!' operator.
 */
export const CutProp: PredProp = {
  pred: '!',
  term: nilTerm,
};

export const TrueProp: PredProp = {
  pred: 'true',
  term: nilTerm,
};

/**
 * Rule: an axiom or inference rule that we consider is true with no thought.
 */
export interface Rule {
  /**
   * An atomic proposition that we can consider is true if the goal is true.
   */
  head: PredProp;

  /**
   * Goal: one of propositions to let the head be true.
   */
  goal?: Prop | undefined;
}

export type Statement =
  | Rule
  | Query
  ;

export interface Query {
  query: Prop;
}

/**
 * Knowledge: a set of inference rules to be added to the proof system.
 */
export interface Knowledge {
  [predName: string]: Rule[] | undefined;
}

/**
 * Env: a set of bindings.
 */
export interface Env {
  [varName: string]: {
    [varId: number]: Term | undefined;
  } | undefined;
}

/**
 * One of assignments that let the query be true. Variables occur in given order.
 */
export type Solution = Array<{
  varName: string,
  term: Term,
}>;

export interface ProofSystem {
  assume(rule: Rule): ProofSystem;
  query(query: Query): Iterable<Solution>;
}

export interface LangParser {
  parse(source: string): Statement | { err: string };
}

export interface Repl {
  input(source: string): { accepted: true } | { solutions: Iterable<Solution> } | { err: string };
}

export interface Logger {
  debug(value: {}): void;
}
