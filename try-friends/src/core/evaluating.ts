import {
  AppTerm,
  Assignment,
  CutProp,
  Env,
  Knowledge,
  nilTerm,
  Pred,
  PredProp,
  ProofSystem,
  Prop,
  Query,
  Rule,
  Solution,
  Term,
  TrueProp,
  Var,
  VarId,
  VarTerm,
} from './ast';
import { distinct, flatMap } from './iterable';
import { TestSuite } from './testing-types';
import { exhaust } from './util';

const nextVarId = (() => {
  let count = 0;
  return () => ++count;
})();

const zeroTerm = { atom: '0' };
const succTerm = { atom: 'succ' };

const Term = {
  vars(term: Term): Var[] {
    if ('var' in term) {
      return [term.var];
    } else if ('atom' in term) {
      return [];
    } else if ('f' in term) {
      return Term.vars(term.x);
    } else if ('head' in term) {
      return [...Term.vars(term.head), ...Term.vars(term.tail)];
    } else {
      return exhaust(term);
    }
  },
  withVarId(term: Term, varId: VarId): Term {
    if ('var' in term) {
      return { var: { varId, varName: term.var.varName } };
    } else if ('atom' in term) {
      return term;
    } else if ('f' in term) {
      return {
        f: term.f,
        x: Term.withVarId(term.x, varId),
      };
    } else if ('head' in term) {
      return {
        head: Term.withVarId(term.head, varId),
        tail: Term.withVarId(term.tail, varId),
      };
    } else {
      return exhaust(term);
    }
  },
};

const Prop = {
  withVarId(prop: Prop, varId: VarId): Prop {
    if ('pred' in prop) {
      return {
        pred: prop.pred,
        term: Term.withVarId(prop.term, varId),
      };
    } else if ('left' in prop) {
      return {
        left: Prop.withVarId(prop.left, varId),
        right: Prop.withVarId(prop.right, varId),
      };
    } else {
      return exhaust(prop);
    }
  },

  /**
   * Refresh all variables in the proposition
   * by changing var ids to fresh one.
   */
  refresh(prop: Prop): Prop {
    return Prop.withVarId(prop, nextVarId());
  },

  vars(prop: Prop): Var[] {
    if ('pred' in prop) {
      return Term.vars(prop.term);
    } else if ('left' in prop) {
      // FIXME: perf
      return [
        ...Prop.vars(prop.left),
        ...Prop.vars(prop.right),
      ];
    } else {
      return exhaust(prop);
    }
  },
};

const Rule = {
  refresh(rule: Rule): Rule {
    const varId = nextVarId();
    const head = Prop.withVarId(rule.head, varId) as PredProp;
    const goal = rule.goal !== undefined
      ? Prop.withVarId(rule.goal, varId)
      : undefined;
    return { head, goal };
  },
};

const Knowledge = {
  default() {
    return {};
  },
  assume(knowledge: Knowledge, rule: Rule): Knowledge {
    const predName = rule.head.pred;
    const rules = [...(knowledge[predName] || []), rule];
    return {
      ...knowledge,
      [predName]: rules,
    };
  },
  assumeMany(knowledge: Knowledge, rules: Rule[]): Knowledge {
    let k = knowledge;
    for (const rule of rules) {
      k = Knowledge.assume(k, rule);
    }
    return k;
  },
  /**
   * Find all rules associated with the specified predicate.
   * The predicate is true only if one of them applies.
   */
  rules(knowledge: Knowledge, predName: string): Rule[] {
    return knowledge[predName] || [];
  },
};

const Env = {
  default() {
    return {};
  },
  tryFind(env: Env, v: Var): Term | undefined {
    const idMap = env[v.varName];
    if (idMap === undefined) {
      return undefined;
    }
    return idMap[v.varId];
  },
  bind(env: Env, v: Var, term: Term): Env {
    const substTerm = Env.substitute(env, term);

    // Avoid recursion.
    if ('var' in substTerm
      && substTerm.var.varName === v.varName
      && substTerm.var.varId === v.varId
    ) {
      return env;
    }

    const idMap = {
      ...(env[v.varName] || {}),
      [v.varId]: substTerm,
    };
    return {
      ...env,
      [v.varName]: idMap,
    };
  },
  /**
   * Substitutes all variables with their bound term in the environment recursively as possible.
   */
  substitute(env: Env, term: Term): Term {
    if ('var' in term) {
      const bound = Env.tryFind(env, term.var);
      if (bound === undefined) {
        return term;
      }
      return Env.substitute(env, bound);
    } else if ('atom' in term) {
      return term;
    } else if ('f' in term) {
      return {
        f: term.f,
        x: Env.substitute(env, term.x),
      };
    } else if ('head' in term) {
      return {
        head: Env.substitute(env, term.head),
        tail: Env.substitute(env, term.tail),
      };
    } else {
      return exhaust(term);
    }
  },
  tryUnify: (() => {
    const tryUnifyVar = (env: Env, v: Var, term: Term): Env | undefined => {
      const bound = Env.tryFind(env, v);
      if (bound === undefined) {
        return Env.bind(env, v, term);
      }
      return Env.tryUnify(env, term, Env.substitute(env, bound));
    };

    return (env: Env, lTerm: Term, rTerm: Term): Env | undefined => {
      if ('var' in lTerm) {
        return tryUnifyVar(env, lTerm.var, rTerm);
      } else if ('var' in rTerm) {
        return tryUnifyVar(env, rTerm.var, lTerm);
      } else if ('atom' in lTerm && 'atom' in rTerm && lTerm.atom === rTerm.atom) {
        return env;
      } else if ('f' in lTerm && 'f' in rTerm && lTerm.f === rTerm.f) {
        return Env.tryUnify(env, lTerm.x, rTerm.x);
      } else if ('head' in lTerm && 'head' in rTerm) {
        const env2 = Env.tryUnify(env, lTerm.head, rTerm.head);
        if (env2 === undefined) {
          return undefined;
        }
        return Env.tryUnify(env2, lTerm.tail, rTerm.tail);
      } else if (
        'atom' in lTerm || 'atom' in rTerm
        || 'f' in lTerm || 'f' in rTerm
        || 'head' in lTerm || 'head' in rTerm
      ) {
        return undefined;
      } else {
        return exhaust(lTerm, rTerm);
      }
    };
  })(),
};

interface ProveResult {
  env: Env;
  cut: boolean;
}

const prove = (() => {
  const isNil = (term: Term): boolean => {
    return 'atom' in term && term.atom === nilTerm.atom;
  };

  function* provePred(prop: PredProp, env: Env, knowledge: Knowledge): Iterable<ProveResult> {
    // Build-in predicates.
    {
      if (prop.pred === CutProp.pred && isNil(prop.term)) {
        yield { env, cut: true };
        return;
      } else if (prop.pred === TrueProp.pred && isNil(prop.term)) {
        yield { env, cut: false };
        return;
      }
    }

    const rules = Knowledge.rules(knowledge, prop.pred);
    for (const defaultRule of rules) {
      const rule = Rule.refresh(defaultRule);

      // Try unify head.
      const env2 = Env.tryUnify(env, prop.term, rule.head.term);
      if (env2 === undefined) {
        continue;
      }

      // Try prove goal.
      if (rule.goal === undefined) {
        yield { env: env2, cut: false };
        continue;
      }

      const results = proveProp(rule.goal, env2, knowledge);
      for (const { env: env3, cut } of results) {
        yield { env: env3, cut: false };
        if (cut) {
          return;
        }
      }
    }
  }

  function* proveProp(prop: Prop, env: Env, knowledge: Knowledge): Iterable<ProveResult> {
    if ('pred' in prop) {
      for (const result of provePred(prop, env, knowledge)) {
        yield result;
      }
    } else if ('left' in prop) {
      for (const { env: env2, cut: cut2 } of proveProp(prop.left, env, knowledge)) {
        for (const { env: env3, cut: cut3 } of proveProp(prop.right, env2, knowledge)) {
          yield { env: env3, cut: cut2 || cut3 };
        }
      }
    } else {
      return exhaust(prop);
    }
  }

  function* proveCore(prop: Prop, env: Env, knowledge: Knowledge): Iterable<Env> {
    for (const { env: nextEnv } of proveProp(prop, env, knowledge)) {
      yield nextEnv;
    }
  }

  return proveCore;
})();

export function* query(prop: Prop, globalEnv: Env, globalKnowledge: Knowledge): Iterable<Solution> {
  prop = Prop.refresh(prop);
  const vars = [...distinct(Prop.vars(prop))];
  for (const localEnv of prove(prop, globalEnv, globalKnowledge)) {
    const solution: Solution = [];
    for (const v of vars) {
      const term = Env.substitute(localEnv, { var: v });
      const unbound = 'var' in term && Env.tryFind(localEnv, term.var) === undefined;

      const assignment: Assignment = unbound
        ? { varName: v.varName, unbound }
        : { varName: v.varName, term };
      solution.push(assignment);
    }
    yield solution;
  }
}

class ImplProofSystem implements ProofSystem {
  constructor(
    private knowledge: Knowledge,
  ) {
  }

  public assume(rule: Rule) {
    return new ImplProofSystem(Knowledge.assume(this.knowledge, rule));
  }

  public query({ query: prop }: Query): Iterable<Solution> {
    return query(prop, Env.default(), this.knowledge);
  }
}

export const createProofSystem = () =>
  new ImplProofSystem(Knowledge.default());

// -------------------------------------------------------------
// Unit Testing
// -------------------------------------------------------------

export const testSuite: TestSuite = ({ describe, context, it, eq }) => {
  const free = (varName: string): VarTerm => ({ var: { varId: -1, varName } });
  const x = free('x');
  const y = free('y');
  const pred = (predName: string) => (term: Term) => ({
    pred: predName,
    term,
  });
  const listTerm = (...terms: Term[]) => {
    let term: Term = nilTerm;
    for (let i = terms.length - 1; i >= 0; i--) {
      term = { head: terms[i], tail: term };
    }
    return term;
  };

  const socrates = { atom: 'socrates' };
  const plato = { atom: 'plato' };
  const f = (t: Term): AppTerm => ({ f: 'f', x: t });

  const mortal = pred('mortal');
  const human = pred('human');

  describe('Knowledge', () => {
    const k = Knowledge.default();

    it('doesn\'t know undefined predicates', () => {
      eq(Knowledge.rules(k, 'human'), []);
    });

    it('can assume many', () => {
      const r1 = { head: human(socrates) };
      const r2 = { head: human(plato) };
      const k1 = Knowledge.assume(k, r1);
      const k2 = Knowledge.assume(k1, r2);
      eq(Knowledge.rules(k1, 'human'), [r1]);
      eq(Knowledge.rules(k2, 'human'), [r1, r2]);
    });
  });

  describe('Env', () => {
    const e = Env.default();

    it('can bind a var and find it', () => {
      eq(Env.tryFind(Env.bind(e, x.var, socrates), x.var), socrates);
    });

    it('can\'t find unbound var', () => {
      eq(Env.tryFind(e, x.var), undefined);
    });

    describe('tryUnify', () => {
      const cases = [
        {
          desc: 'var binding',
          left: x,
          right: socrates,
          test: x,
          expected: socrates,
        },
        {
          desc: 'app binding',
          left: f(x),
          right: f(socrates),
          test: x,
          expected: socrates,
        },
        {
          desc: 'list binding',
          left: listTerm(x, plato),
          right: listTerm(socrates, y),
          test: listTerm(x, y),
          expected: listTerm(socrates, plato),
        },
      ];

      for (const { desc, left, right, test, expected } of cases) {
        it(desc, () => {
          const env = Env.tryUnify(e, left, right);
          if (env === undefined) {
            throw new Error('Couldn\'t unify.');
          }
          eq(Env.substitute(env, test), expected);
        });
      }
    });
  });

  describe('query', () => {
    it('detects unbound vars', () => {
      const k =
        Knowledge.assumeMany(Knowledge.default(), [
          { head: { pred: 'unknown', term: x } },
          { head: { pred: 'unknown', term: { atom: 'a' } } },
        ]);
      eq(
        [...query({ pred: 'unknown', term: y }, Env.default(), k)],
        [
          [
            { varName: 'y', unbound: true },
          ],
          [
            { varName: 'y', term: { atom: 'a' } },
          ],
        ],
      );
    });

    it('includes bindings between vars', () => {
      // unify(X, X). ?- unify(X, Y). should print X=Y or Y=X.
    });
  });

  context('Syllogism', () => {
    const major = {
      head: mortal(x),
      goal: human(x),
    };
    const minor = {
      head: human(socrates),
    };
    const conclution = mortal(socrates);

    const env = Env.default();
    const k = Knowledge.assumeMany(Knowledge.default(), [major, minor]);

    it('can find rules', () => {
      eq(Knowledge.rules(k, conclution.pred), [major]);
      eq(Knowledge.rules(k, major.goal.pred), [minor]);
    });

    it('can match head', () => {
      eq(Env.tryUnify(env, major.head.term, conclution.term), {
        x: {
          [-1]: socrates,
        },
      });
    });

    it('can conclude', () => {
      const solutions = [...query(conclution, env, k)];
      eq(solutions, [[]]);
    });

    it('can find all solutions', () => {
      const platoRule = { head: human(plato) };
      const k2 = Knowledge.assume(k, platoRule);
      const solutions = [...query(mortal(x), env, k2)];
      eq(solutions, [
        [
          { varName: 'x', term: socrates },
        ],
        [
          { varName: 'x', term: plato },
        ],
      ]);
    });
  });
};
