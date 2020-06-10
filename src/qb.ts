import * as r from 'ramda';
import {SQL, SQLStatement} from 'sql-template-strings';

export interface InlineParam {
    ip: any;
}

export interface RawValue {
    r: any;
}

export type ObjectValue = InlineParam | RawValue;

export type Value = string | ObjectValue;

export type ExprOperand = Sql | Value;

export type UnaryOperator = 'null' | 'not_null';

export type BinaryOperator =
    | '='
    | '!='
    | '>'
    | '>='
    | '<'
    | '<='
    | 'as'
    | 'like'
    | 'ilike';

export type VarOperator = 'and' | 'or' | 'case_when' | 'in';

export interface FunctionCall extends Array<any> {
    0: '%';
}

export interface VarExpr extends Array<any> {
    0: VarOperator;
    1: any;
}

export type TableExpr = string | [string | Sql, string] | Sql;

export type Expr =
    | [BinaryOperator, ExprOperand, ExprOperand]
    | string
    | VarExpr
    | FunctionCall
    | [UnaryOperator, any]
    | Value
    | Sql;

export type Join = [
    'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS',
    TableExpr,
    Expr
];

export type OrderBy = [Expr, 'ASC' | 'DESC', 'NULLS FIRST' | 'NULLS LAST'];

export interface Sql {
    select?: Expr[];
    insert_into?: TableExpr;
    update?: TableExpr;
    columns?: string[];
    values?: Value[][];
    on_conflict?: string[];
    set?: Expr[];
    from?: TableExpr;
    join?: Join[];
    do_update?: Expr[];
    where?: Expr;
    group_by?: Expr[];
    order_by?: OrderBy[];
    limit?: number;
    offset?: number;
    for_update?: true;
    returning?: Expr[];
}

interface Statement {
    text: string;
    values: any[];
}

export {Statement as SQLStatement};

/**
 * Determines the order that clauses will be placed within generated SQL
 */
const clausePriorities = r.invertObj([
    'select',
    'insert_into',
    'update',
    'columns',
    'values',
    'on_conflict',
    'set',
    'from',
    'join',
    'do_update',
    'where',
    'group_by',
    'order_by',
    'limit',
    'offset',
    'for_update',
    'returning',
]);

/**
 * Escapes identifier by wrapping it into double quotes.
 *
 * @example
 * escape('table'); //=> '"table"'
 * excape('t'.'id'); //=> '"t"."id"'
 */
function escape(identifier: string): string {
    return r.join('.', r.map((id) => `"${id}"`, r.split('.', identifier)));
}

/**
 * Wraps text in parens (works also on SQLStatements).
 *
 * @example
 * wrapInParens('t.id, t.code'); //=> '(t.id, t.code)'
 */
function wrapInParens(text: SQLStatement): SQLStatement;
function wrapInParens(text: string): string;
function wrapInParens(text) {
    if (typeof text === 'string') {
        return `(${text})`;
    }

    return SQL`(`.append(text).append(')');
}

/**
 * Takes list of columns and converts it into SQL list of columns.
 *
 * @example
 * columnList(['col1', 'col2']); //=> '("col1", "col2")'
 */
function columnList(columns: string[]): string {
    return wrapInParens(r.map(escape, columns).join(', '));
}

function isValue(arg): arg is Value {
    return r.or(
        typeof arg === 'string',
        r.and(typeof arg === 'object', r.has('ip', arg) || r.has('r', arg))
    );
}

/**
 * Takes list of row and converts it into SQLStatement.
 *
 * @example
 * valueList(
 *  [{ip: 'val1'}],
 *  [{ip: 'val2'}]
 * ); //=> {text: '($1, $2)', values: ['val1', 'val2']}
 */
function valueList(row: Value[]): SQLStatement {
    return r
        .reduce(
            (sql, part) => sql.append(part),
            SQL`(`,
            r.intersperse<SQLStatement | string>(', ', r.map(convertValue, row))
        )
        .append(')');
}

/**
 * Takes object value and converts it into SQLStatement
 *
 * @example
 * convertObjectValue({ip: 3}); //=> {text: '$1', values: [3]}
 *
 * convertObjectValue({r: 'NOW()'}) //=> {text: 'NOW()', values: []}
 */
function convertObjectValue(val: ObjectValue): SQLStatement {
    const inlineParam = r.prop<any, any>('ip', val);
    if (inlineParam !== undefined) {
        return SQL`${inlineParam}`;
    }

    const rawValue = r.prop<any, any>('r', val);
    if (rawValue !== undefined) {
        return SQL``.append(rawValue);
    }

    throw new Error(`Invalid expr value: ${JSON.stringify(val)}`);
}

/**
 * Takes value and converts it into SQLStatement
 *
 * @example
 * convertValue('t.id'); // => {text: '"t"."id"', values: []}
 *
 * convertValue({ip: 3}); //=> {text: '$1', values: [3]}
 *
 * convertValue({r: 'NOW()'}) //=> {text: 'NOW()', values: []}
 */
function convertValue(val: Value): SQLStatement {
    return typeof val === 'object'
        ? convertObjectValue(val)
        : SQL``.append(escape(val));
}

/**
 * Takes table expression and converts int into string or SQLStatement.
 *
 * @example
 * tableExpr('table'); //=> '"table"'
 *
 * tableExpr(['table', 'alias']); //=> '"table" "t"'
 *
 * tableExpr([{select: 'id'}, 'alias']); //=> '(SELECT "id") "alias"'
 *
 * tableExpr({select: 'id'}); //=> '(SELECT "id")'
 */
function tableExpr(table: TableExpr): string | SQLStatement {
    if (typeof table === 'string') {
        return escape(table);
    }

    if (Array.isArray(table)) {
        const t = table[0];
        if (typeof t === 'object') {
            return wrapInParens(_toSql(t)).append(` ${escape(table[1])}`);
        } else {
            return `${escape(t)} ${escape(table[1])}`;
        }
    }

    return wrapInParens(_toSql(table));
}

/**
 * Appends several strings or statements into one.
 *
 * @example
 * appendToStatement(
 *  {text: 'SELECT "id"', values: []},
 *  [
 *   ' FROM ',
 *   {text: '"table"', values: []},
 *  ]
 * ); //=> {text: 'SELECT "id" FROM "table", values: []}
 */
function appendToStatement(st: SQLStatement, list: (string | SQLStatement)[]) {
    return r.reduce((sql, part) => sql.append(part), st, list);
}

/**
 * Returns handler for given operator with variadic number of expressions.
 *
 * @example
 * varOperatorHandler('AND')(
 *  ['=', 'col1', 'col2'],
 *  ['!=', 'col3', 'col4']
 * ) //=> {text: '("col1" = "col2" AND "col3" != "col4")', values: []}
 */
function varOperatorHandler(operator: string) {
    return (...exprs: Expr[]) =>
        wrapInParens(
            appendToStatement(
                SQL``,
                r.intersperse<SQLStatement | string>(
                    ` ${operator} `,
                    r.map(handleExpr, exprs)
                )
            )
        );
}

/**
 * Returns handler for given binary operator.
 *
 * @example
 * binaryOperatorHandler('=')(
 *  'col1',
 *  'col2'
 * ); //=> {text: '"col1" = "col2"', values: []}
 */
function binaryOperatorHandler(operator: string) {
    return (op1: Expr, op2: Expr): SQLStatement =>
        handleExpr(op1)
            .append(` ${operator} `)
            .append(handleExpr(op2));
}

type ExprHandler = (...args) => SQLStatement;

interface ExprToHandlerMap {
    [key: string]: ExprHandler;
}

/**
 * Returns SQLStatement for CASE part based on given SQLStatements (1 or 2)
 *
 * @example
 * handleCaseExprTuple([
 *  {text: '"col1" = "col2"', values: []},
 *  {text: '1 = 0', values: []},
 * ]); //=> {text: 'WHEN "col1" = "col2" THEN 1 = 0', values: []}
 *
 * handleCaseExprTuple([
 *  {text: '1 = 1', values: []},
 * ]); //=> {text: 'ELSE 1 = 1', values: []}
 */
function handleCaseExprTuple(statements: SQLStatement[]): SQLStatement {
    return statements.length === 2
        ? SQL`WHEN `
              .append(statements[0])
              .append(' THEN ')
              .append(statements[1])
        : SQL`ELSE `.append(statements[0]);
}

function inHandler(expr: Expr, vals: Sql);
function inHandler(expr: Expr, ...vals: Value[]);
function inHandler(expr: Expr, ...vals: any[]) {
    return handleExpr(expr)
        .append(' IN')
        .append(
            vals.length === 1 && !isValue(vals[0])
                ? wrapInParens(_toSql(vals[0]))
                : valueList(vals)
        );
}

/**
 * Map from expression operators to expression handlers. Handlers
 * returns result in form of SQLStatement
 *
 * @example
 * exprHandlers['=']('col1', {ip: 3}); //=> {text: '"col1" = $1', values: [3]}
 */
const exprHandlers: ExprToHandlerMap = {
    '=': binaryOperatorHandler('='),
    '!=': binaryOperatorHandler('!='),
    '>': binaryOperatorHandler('>'),
    '>=': binaryOperatorHandler('>='),
    '<': binaryOperatorHandler('<'),
    '<=': binaryOperatorHandler('<='),
    as: binaryOperatorHandler('as'),
    '%': (f, ...args) =>
        SQL``
            .append(r.toUpper(f))
            .append(
                wrapInParens(
                    appendToStatement(
                        SQL``,
                        r.intersperse<SQLStatement | string>(
                            ', ',
                            r.map(handleExpr, args)
                        )
                    )
                )
            ),
    and: varOperatorHandler('AND'),
    or: varOperatorHandler('OR'),
    null: (expr: Expr) => handleExpr(expr).append(' IS NULL'),
    not_null: (expr: Expr) => handleExpr(expr).append(' IS NOT NULL'),
    case_when: (...args: Expr[]) =>
        appendToStatement(
            SQL`CASE `,
            r.intersperse<SQLStatement | string>(
                ' ',
                r.map(
                    (statements) => handleCaseExprTuple(statements),
                    r.splitEvery(2, r.map(handleExpr, args))
                )
            )
        ).append(' END'),
    in: inHandler,
    like: binaryOperatorHandler('LIKE'),
    ilike: binaryOperatorHandler('ILIKE'),
};

/**
 * Returns handler for multiple expressions prefixed with `statementStart`.
 *
 * @example
 * exprsHandler('SET ')([
 *  ['=', 'col1', 'col2'],
 * ]); //=> {text: 'SET "col1" = "col2"', values: []}
 */
function exprsHandler(statementStart: string) {
    return function(exprs: Expr[]): SQLStatement {
        return appendToStatement(
            SQL``.append(statementStart),
            r.intersperse<SQLStatement | string>(', ', r.map(handleExpr, exprs))
        );
    };
}

/**
 * Returns handler for table expression prefixed with `statementStart`.
 *
 * @example
 * tableExprHandler('INSERT INTO ')(['table']); //=> {text: 'INSERT INTO "table"', values: []}
 */
function tableExprHandler(statementStart: string) {
    return function(table: TableExpr): SQLStatement {
        return SQL``.append(statementStart).append(tableExpr(table));
    };
}

type ClauseHandler = (arg: any) => SQLStatement | string;

interface ClauseToHandlerMap {
    [key: string]: ClauseHandler;
}

/**
 * Map from clauses to clause handlers. Clauses returns result in form of SQLStatement or string.
 *
 * @example
 * clauseHandlers['columns']('col1', 'col2'); //=> '("col1", "col2")'
 */
const clauseHandlers: ClauseToHandlerMap = {
    select: exprsHandler('SELECT '),
    insert_into: tableExprHandler('INSERT INTO '),
    update: tableExprHandler('UPDATE '),
    columns: (columns: string[]) => columnList(columns),
    values: (list: Value[][]) =>
        appendToStatement(
            SQL`VALUES `,
            r.intersperse<SQLStatement | string>(
                ', ',
                r.map((row) => valueList(row), list)
            )
        ),
    on_conflict: (columns: string[]) => `ON CONFLICT ${columnList(columns)}`,
    do_update: exprsHandler('DO UPDATE SET '),
    set: exprsHandler('SET '),
    from: tableExprHandler('FROM '),
    join: (joins: Join[]) =>
        appendToStatement(
            SQL``,
            r.intersperse<SQLStatement | string>(
                ' ',
                r.map(
                    (join) =>
                        appendToStatement(
                            SQL``,
                            r.intersperse(' ', [
                                join[0],
                                'JOIN',
                                tableExpr(join[1]),
                                'ON',
                                handleExpr(join[2]),
                            ])
                        ),
                    joins
                )
            )
        ),
    where: (expr: Expr) => SQL`WHERE `.append(handleExpr(expr)),
    group_by: (exprs: Expr[]) =>
        appendToStatement(
            SQL`GROUP BY `,
            r.intersperse<string | SQLStatement>(', ', r.map(handleExpr, exprs))
        ),
    order_by: (orderBy: OrderBy) =>
        appendToStatement(
            SQL`ORDER BY `,
            r.intersperse<string | SQLStatement>(
                ', ',
                r.map(
                    (order) =>
                        handleExpr(order[0])
                            .append(' ')
                            .append(order[1])
                            .append(' ')
                            .append(order[2]),
                    orderBy
                )
            )
        ),
    limit: (l: number) => `LIMIT ${l}`,
    offset: (o: number) => `OFFSET ${o}`,
    for_update: () => 'FOR UPDATE',
    returning: exprsHandler('RETURNING '),
};

/**
 * Converts single expression into SQLStatement
 *
 * @example
 * handleExpr(['=', 'col1', 'col2']); //=> {text: '"col1" = "col2"', values: []}
 */
function handleExpr(expr: Expr): SQLStatement {
    if (isValue(expr)) {
        return convertValue(expr);
    }

    if (!Array.isArray(expr)) {
        return wrapInParens(_toSql(expr));
    }

    const handler = r.prop<keyof ExprToHandlerMap, ExprToHandlerMap>(
        r.head(expr),
        exprHandlers
    );
    if (!handler) {
        throw new Error(
            `Unknown expr ${r.head(expr)}. Supported exprs: ${Object.keys(
                exprHandlers
            ).join(', ')}`
        );
    }

    return handler(...r.tail(expr));
}

/**
 * Converts clause with name `clauseKey` from `m` into string or SQLStatement.
 *
 * @example
 * clauseToSql(
 *  {
 *   select: 'id',
 *   from: 'table',
 *  },
 *  'select'
 * ); //=> {text: 'SELECT "id"', values: []}
 */
function clauseToSql(m: Sql, clauseKey: string): SQLStatement | string {
    const handler = r.prop<keyof ClauseToHandlerMap, ClauseToHandlerMap>(
        clauseKey,
        clauseHandlers
    );
    if (!handler) {
        throw new Error(
            `Unknown clause ${clauseKey}. Supported clauses: ${Object.keys(
                clauseHandlers
            ).join(', ')}.`
        );
    }

    return handler(m[clauseKey]);
}

/**
 * Converts sql data stucture `m` into SQLStatement.
 *
 * @example
 * _toSql({
 *  select: 'id',
 *  from: 'table',
 * }); //=> {text: 'SELECT "id" FROM "table"'}
 */
function _toSql(m: Sql): SQLStatement {
    const sortedClauses = r.sortBy(
        (clause) => Number(clausePriorities[clause]),
        Object.keys(m)
    );

    return r.reduce(
        (sql, clauseKey) => sql.append(' ').append(clauseToSql(m, clauseKey)),
        SQL``.append(clauseToSql(m, r.head(sortedClauses) as string)),
        r.tail(sortedClauses)
    );
}

/**
 * Converts sql data structure `m` into Statement.
 *
 * @example
 * _toSql({
 *  select: 'id',
 *  from: 'table',
 *  where: ['=', 'id', {ip: 1}]
 * }); //=> {text: 'SELECT "id" FROM "table" WHERE "id" = $1', values: [1]}
 */
export function toSql(m: Sql): Statement {
    return _toSql(m);
}
