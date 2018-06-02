import { testSuite as awesome } from './awesome.spec';
import { testSuite as evaluating } from './evaluating';
import { testSuite as iterable } from './iterable';
import { testSuite as parsing } from './parsing';
import { runTests } from './testing';

runTests({
  awesome,
  iterable,
  parsing,
  evaluating,
});
