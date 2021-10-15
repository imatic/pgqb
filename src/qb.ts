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

export type UnaryOperator = 'null' | 'not_null' | 'not' | 'exists';

export type BinaryOperator =
    | '='
    | '!='
    | '>'
    | '>='
    | '<'
    | '<='
    | 'as'
    | 'like'
    | 'ilike'
    | '&&';

export type VarOperator = 'and' | 'or' | 'case_when' | 'in' | 'not_in';

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
    select_distinct?: {on: Expr[]; exprs: Expr[]};
    insert_into?: TableExpr;
    update?: TableExpr;
    columns?: string[];
    values?: Value[][];
    on_conflict?: string[];
    set?: Expr[];
    from?: TableExpr;
    join?: Join[];
    do_update?: Expr[];
    do_nothing?: null;
    where?: Expr;
    group_by?: Expr[];
    having?: Expr;
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
const clausePriorities = invertObj([
    'select',
    'select_distinct',
    'insert_into',
    'update',
    'columns',
    'values',
    'on_conflict',
    'set',
    'from',
    'join',
    'do_update',
    'do_nothing',
    'where',
    'group_by',
    'having',
    'order_by',
    'limit',
    'offset',
    'for_update',
    'returning',
]);

function intersperse<T, S>(separator: S, arr: Array<T>): Array<T | S> {
    const length = arr.length;
    if (length === 0) {
        return Array(0);
    }

    const res: Array<T | S> = Array(length * 2 - 1);
    for (let i = 0; i < length; i++) {
        if (i === length - 1) {
            res.push(arr[i]);
        } else {
            res.push(arr[i], separator);
        }
    }

    return res;
}

function invertObj(obj: object): object {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));
}

function splitEvery<T>(n: number, arr: Array<T>): Array<T>[] {
    const length = arr.length;
    const res: Array<T>[] = [];
    for (let i = 0; i < length; i += n) {
        res.push(arr.slice(i, i + n));
    }

    return res;
}

/**
 * Escapes identifier by wrapping it into double quotes.
 *
 * @example
 * escape('table'); //=> '"table"'
 * escape('t.id'); //=> '"t"."id"'
 * escape('"t"."id"'); //=> '"t"."id"'
 */
function escape(identifier: string): string {
    if (identifier[0] === '"') {
        return identifier;
    }

    return identifier
        .split('.')
        .map((id) => '"' + id + '"')
        .join('.');
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
    if (columns.length === 0) {
        return '';
    }

    return wrapInParens(columns.map((v) => escape(v)).join(', '));
}

function isValue(arg): arg is Value {
    return (
        typeof arg === 'string' ||
        (typeof arg === 'object' &&
            (arg.hasOwnProperty('ip') || arg.hasOwnProperty('r')))
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
    return intersperse(
        ', ',
        row.map((v) => convertValue(v))
    )
        .reduce((sql, part) => sql.append(part), SQL`(` as any)
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
    const inlineParam = val['ip'];
    if (inlineParam !== undefined) {
        return SQL`${inlineParam}`;
    }

    const rawValue = val['r'];
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
function appendToStatement(
    st: SQLStatement,
    list: (string | SQLStatement)[]
): SQLStatement {
    return list.reduce(
        (sql: SQLStatement, part) => sql.append(part),
        st as any
    );
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
                intersperse(
                    ` ${operator} `,
                    exprs.map((expr) => handleExpr(expr))
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
        handleExpr(op1).append(` ${operator} `).append(handleExpr(op2));
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

function notInHandler(expr: Expr, vals: Sql);
function notInHandler(expr: Expr, ...vals: Value[]);
function notInHandler(expr: Expr, ...vals: any[]) {
    return handleExpr(expr)
        .append(' NOT IN')
        .append(
            vals.length === 1 && !isValue(vals[0])
                ? wrapInParens(_toSql(vals[0]))
                : valueList(vals)
        );
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
    '&&': binaryOperatorHandler('&&'),
    as: binaryOperatorHandler('as'),
    '%': (f, ...args) =>
        SQL``.append(f.toUpperCase()).append(
            wrapInParens(
                appendToStatement(
                    SQL``,
                    intersperse(
                        ', ',
                        args.map((expr) => handleExpr(expr))
                    )
                )
            )
        ),
    and: varOperatorHandler('AND'),
    or: varOperatorHandler('OR'),
    null: (expr: Expr) => handleExpr(expr).append(' IS NULL'),
    not_null: (expr: Expr) => handleExpr(expr).append(' IS NOT NULL'),
    not: (expr: Expr) => SQL`NOT `.append(wrapInParens(handleExpr(expr))),
    exists: (sqlMap: Sql) =>
        SQL`EXISTS `.append(wrapInParens(handleExpr(sqlMap))),
    case_when: (...args: Expr[]) =>
        appendToStatement(
            SQL`CASE `,
            intersperse(
                ' ',
                splitEvery(
                    2,
                    args.map((expr) => handleExpr(expr))
                ).map((statements) => handleCaseExprTuple(statements))
            )
        ).append(' END'),
    in: inHandler,
    not_in: notInHandler,
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
    return function (exprs: Expr[]): SQLStatement {
        return appendToStatement(
            SQL``.append(statementStart),
            intersperse(
                ', ',
                exprs.map((expr) => handleExpr(expr))
            )
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
    return function (table: TableExpr): SQLStatement {
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
    select_distinct: ({on, exprs}: {on: Expr[]; exprs: Expr[]}) => {
        const onSt = appendToStatement(
            SQL`SELECT DISTINCT ON (`,
            intersperse(
                ', ',
                on.map((expr) => handleExpr(expr))
            )
        ).append(') ');

        return appendToStatement(
            onSt,
            intersperse(
                ', ',
                exprs.map((expr) => handleExpr(expr))
            )
        );
    },
    insert_into: tableExprHandler('INSERT INTO '),
    update: tableExprHandler('UPDATE '),
    columns: (columns: string[]) => columnList(columns),
    values: (list: Value[][]) =>
        list.length === 0 ? 'DEFAULT VALUES' : appendToStatement(
            SQL`VALUES `,
            intersperse(
                ', ',
                list.map((row) => valueList(row))
            )
        ),
    on_conflict: (columns: string[]) => `ON CONFLICT ${columnList(columns)}`,
    do_update: exprsHandler('DO UPDATE SET '),
    do_nothing: () => 'DO NOTHING',
    set: exprsHandler('SET '),
    from: tableExprHandler('FROM '),
    join: (joins: Join[]) =>
        appendToStatement(
            SQL``,
            intersperse(
                ' ',
                joins.map((join) =>
                    appendToStatement(
                        SQL``,
                        intersperse(' ', [
                            join[0],
                            'JOIN',
                            tableExpr(join[1]),
                            'ON',
                            handleExpr(join[2]),
                        ])
                    )
                )
            )
        ),
    where: (expr: Expr) => SQL`WHERE `.append(handleExpr(expr)),
    group_by: (exprs: Expr[]) =>
        appendToStatement(
            SQL`GROUP BY `,
            intersperse(
                ', ',
                exprs.map((expr) => handleExpr(expr))
            )
        ),
    having: (expr: Expr) => SQL`HAVING `.append(handleExpr(expr)),
    order_by: (orderBy: OrderBy) =>
        appendToStatement(
            SQL`ORDER BY `,
            intersperse(
                ', ',
                orderBy.map((order) =>
                    handleExpr(order[0])
                        .append(' ')
                        .append(order[1])
                        .append(' ')
                        .append(order[2])
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

    const handler = exprHandlers[expr[0]];
    if (!handler) {
        throw new Error(
            `Unknown expr ${expr[0]}. Supported exprs: ${Object.keys(
                exprHandlers
            ).join(', ')}`
        );
    }

    return handler(...expr.slice(1));
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
    const handler = clauseHandlers[clauseKey];
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
    const sortedClauses = Object.keys(m).sort((a, b) => {
        return Number(clausePriorities[a]) - Number(clausePriorities[b]);
    });

    return sortedClauses
        .slice(1)
        .reduce(
            (sql, clauseKey) =>
                sql.append(' ').append(clauseToSql(m, clauseKey)),
            SQL``.append(clauseToSql(m, sortedClauses[0] as string))
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
