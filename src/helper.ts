import * as qb from './qb';
import * as r from 'ramda';

/**
 * Merges more sql maps into 1. If same property exists in more maps, value from last map
 * having the property is used.
 *
 * @example
 * merge(
 *  {select: ['val']},
 *  {from: 'table'},
 *  {select: ['val2']}
 * ); //=> {select: ['val2'], from: 'table'}
 */
export function merge(...m: qb.Sql[]): qb.Sql {
    return r.reduce<qb.Sql, qb.Sql>(r.mergeRight, {}, m);
}

/**
 * Handlers for appending value of first clause to value of second clause.
 */
const appendHandlers = {
    columns: (c1: string[], c2: string[]): string[] => r.concat(c1, c2),
    values: (v1: qb.Value[][], v2: qb.Value[][]): qb.Value[][] =>
        r.map(
            (k) => r.concat(v1[k] as qb.Value[], v2[k] as qb.Value[]),
            Object.keys(v1)
        ),
    where: (e1: qb.Expr, e2: qb.Expr) => ['and', e1, e2],
    set: (e1: qb.Expr[], e2: qb.Expr[]) => r.concat(e1, e2),
    order_by: (o1: qb.OrderBy, o2: qb.OrderBy) => r.concat(o1, o2),
    select: (s1: qb.Expr[], s2: qb.Expr[]) => r.concat(s1, s2),
    join: (j1: qb.Join[], j2: qb.Join[]) => r.concat(j1, j2),
    group_by: (g1: qb.Expr[], g2: qb.Expr[]) => r.concat(g1, g2),
};

/**
 * Checks if append handlers exists for clauses in given map, throws exception if not.
 */
function checkAppendSupportedClauses(m: qb.Sql) {
    const unsupportedClauses = Object.keys(
        r.omit(Object.keys(appendHandlers), m)
    );

    if (unsupportedClauses.length) {
        throw new Error(
            `Trying to append following unsupported clauses: ${unsupportedClauses.join(
                ', '
            )}. Only following clauses are supported: ${Object.keys(
                appendHandlers
            ).join(', ')}`
        );
    }
}

/**
 * Appends clauses from second map to clauses in first map and returns new map with
 * all clauses appended.
 *
 * @example
 * _append(
 *  {columns: ['col1', 'col2']},
 *  {columns: ['col3']}
 * ); //=> {columns: ['col1', 'col2', 'col3']}
 */
function _append(m1: qb.Sql, m2: qb.Sql): qb.Sql {
    checkAppendSupportedClauses(m2);

    return r.reduce(
        (m, k) => r.assoc(k, m[k] ? appendHandlers[k](m1[k], m2[k]) : m2[k], m),
        m1,
        Object.keys(m2)
    );
}

/**
 * Appends clauses from maps to clauses in first map and returns new map with
 * all clauses appended.
 *
 * @example
 * _append(
 *  {columns: ['col1', 'col2']},
 *  {columns: ['col3']}
 * ); //=> {columns: ['col1', 'col2', 'col3']}
 */
export function append(...m: qb.Sql[]): qb.Sql {
    return r.reduce(_append, r.head(m) as qb.Sql, r.tail(m) as qb.Sql[]);
}

export function select(exprs: qb.Expr[]): qb.Sql {
    return {select: exprs};
}

export function insertInto(table: string | qb.Sql, alias?: string): qb.Sql {
    return {insert_into: r.isNil(alias) ? table : [table, alias]};
}

export function update(table: string | qb.Sql, alias?: string): qb.Sql {
    return {update: r.isNil(alias) ? table : [table, alias]};
}

export function columns(columns: string[]): qb.Sql {
    return {columns: columns};
}

export function values(values: qb.Value[][]): qb.Sql {
    return {values: values};
}

export function onConflict(columns: string[]): qb.Sql {
    return {on_conflict: columns};
}

export function set(exprs: qb.Expr[]): qb.Sql {
    return {set: exprs};
}

export function from(table: string | qb.Sql, alias?: string): qb.Sql {
    return {from: r.isNil(alias) ? table : [table, alias]};
}

export function joins(...joins: qb.Join[]): qb.Sql {
    return {join: joins};
}

export function join(
    table: string | qb.Sql,
    alias: string,
    expr: qb.Expr
): qb.Join {
    return ['INNER', [table, alias], expr];
}

export function leftJoin(
    table: string | qb.Sql,
    alias: string,
    expr: qb.Expr
): qb.Join {
    return ['LEFT', [table, alias], expr];
}

export function doUpdate(exprs: qb.Expr[]): qb.Sql {
    return {do_update: exprs};
}

export function doNothing(): qb.Sql {
    return {do_nothing: null};
}

export function where(expr: qb.Expr): qb.Sql {
    return {where: expr};
}

export function groupBy(exprs: qb.Expr[]): qb.Sql {
    return {group_by: exprs};
}

export function orderBy(
    expr: qb.Expr,
    direction?: 'ASC' | 'DESC',
    nullsFirst?: boolean
): qb.Sql {
    const directionString = direction || 'ASC';
    nullsFirst =
        nullsFirst === undefined
            ? direction === 'DESC'
                ? true
                : false
            : nullsFirst;
    const nullsFirstString = nullsFirst ? 'NULLS FIRST' : 'NULLS LAST';

    return {
        order_by: [[expr, directionString, nullsFirstString]],
    };
}

export function limit(n): qb.Sql {
    return {limit: n};
}

export function offset(n): qb.Sql {
    return {offset: n};
}

export function forUpdate(): qb.Sql {
    return {for_update: true};
}

export function returning(exprs: qb.Expr[]): qb.Sql {
    return {returning: exprs};
}

function binaryExprHandler(operator: qb.BinaryOperator) {
    return (expr1: qb.ExprOperand, expr2: qb.ExprOperand): qb.Expr => [
        operator,
        expr1,
        expr2,
    ];
}

/**
 * Expression handlers.
 */
export const expr = {
    eq: binaryExprHandler('='),
    neq: binaryExprHandler('!='),
    gt: binaryExprHandler('>'),
    gte: binaryExprHandler('>='),
    lt: binaryExprHandler('<'),
    lte: binaryExprHandler('<='),
    as: binaryExprHandler('as'),
    like: binaryExprHandler('like'),
    ilike: binaryExprHandler('ilike'),
    and: (expr: qb.Expr, ...exprs: qb.Expr[]): qb.Expr => [
        'and',
        expr,
        ...exprs,
    ],
    or: (expr: qb.Expr, ...exprs: qb.Expr[]): qb.Expr => ['or', expr, ...exprs],
    fn: (name: string, ...args: any[]): qb.Expr =>
        ['%', name, ...args] as qb.Expr,
    null: (expr: qb.Expr): qb.Expr => ['null', expr],
    notNull: (expr: qb.Expr): qb.Expr => ['not_null', expr],
    caseWhen: (arg: qb.Expr, ...args: qb.Expr[]): qb.Expr => [
        'case_when',
        arg,
        ...args,
    ],
    in: (expr: qb.Expr, values: qb.Value[] | qb.Sql) =>
        ['in', expr, ...(Array.isArray(values) ? values : [values])] as qb.Expr,
    notIn: (expr: qb.Expr, values: qb.Value[] | qb.Sql) =>
        ['not_in', expr, ...(Array.isArray(values) ? values : [values])] as qb.Expr,
};

/**
 * Functions inserting value into sql map.
 */
export const val = {
    raw: (val: any): qb.Value => {
        return {r: val};
    },
    inlineParam: (val: any): qb.Value => {
        return {ip: val};
    },
};
