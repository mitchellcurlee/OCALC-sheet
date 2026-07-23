#!/usr/bin/env node
// Directly evaluate the current computeConnectionPairs implementation from source
// for narrow regression coverage around UG Path Start/End and custom straddle connections.
import fs from 'fs';
import vm from 'vm';

const srcPath = '/app/frontend/src/lib/poleMapImage.js';
const src = fs.readFileSync(srcPath, 'utf8');
const start = src.indexOf('export const computeConnectionPairs');
if (start < 0) throw new Error('computeConnectionPairs export not found');
const end = src.indexOf('\n};', start) + 3;
const fnSrc = src.slice(start, end).replace('export const computeConnectionPairs', 'const computeConnectionPairs');
const context = {};
vm.createContext(context);
vm.runInContext(`${fnSrc}\nthis.computeConnectionPairs = computeConnectionPairs;`, context);
const computeConnectionPairs = context.computeConnectionPairs;

const item = (id, type, sort_order, label, ugType = undefined) => ({ id, type, sort_order, label, ugType, pos: [0, sort_order] });
const routeBase = [item('p1', 'pole', 0, 'P1'), item('p2', 'pole', 1, 'P2'), item('p3', 'pole', 4, 'P3')];
const ugBase = [item('hh', 'underground', 3, 'HH-1', 'Handhole'), item('ugps', 'underground', 2, 'UG Path Start', 'UG Path Start')];
const staleConns = [
  { from_item_id: 'p1', to_item_id: 'p2', connection_type: 'aerial' },
  { from_item_id: 'p2', to_item_id: 'hh', connection_type: 'underground' },
  { from_item_id: 'hh', to_item_id: 'p3', connection_type: 'underground' },
];
const labels = (pairs) => pairs.map((p) => `${p.from.id}->${p.to.id}`);
const assertEq = (name, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
  console.log(`PASS ${name}: ${JSON.stringify(actual)}`);
};

assertEq('UG Path Start drops stale P2-HH and sorts fallback pairs', labels(computeConnectionPairs(routeBase, ugBase, staleConns)), ['p1->p2', 'p2->ugps', 'ugps->hh', 'hh->p3']);

const routeWithEnd = [item('p1', 'pole', 0, 'P1'), item('p2', 'pole', 1, 'P2'), item('p3', 'pole', 5, 'P3')];
const ugWithEnd = [...ugBase, item('ugpe', 'underground', 4, 'UG Path End', 'UG Path End')];
assertEq('UG Path End inserts between HH and P3 and drops stale HH-P3', labels(computeConnectionPairs(routeWithEnd, ugWithEnd, staleConns)), ['p1->p2', 'p2->ugps', 'ugps->hh', 'hh->ugpe', 'ugpe->p3']);

assertEq('empty connections use plain sort_order chain', labels(computeConnectionPairs(routeWithEnd, ugWithEnd, [])), ['p1->p2', 'p2->ugps', 'ugps->hh', 'hh->ugpe', 'ugpe->p3']);

const customConns = [
  { from_item_id: 'p1', to_item_id: 'p2', connection_type: 'aerial' },
  { from_item_id: 'p2', to_item_id: 'hh', connection_type: 'custom' },
];
const customPairs = labels(computeConnectionPairs(routeBase, ugBase, customConns));
if (!customPairs.includes('p2->hh')) throw new Error(`custom straddling connection was dropped: ${JSON.stringify(customPairs)}`);
console.log(`PASS custom straddling connection retained: ${JSON.stringify(customPairs)}`);