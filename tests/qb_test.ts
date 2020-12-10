import {expect} from 'chai';
import * as qb from '../src/qb';
import * as r from 'ramda';

describe('common/qb', () => {
    describe('toSql', () => {
        const tests: {name: string; map: qb.Sql; sql: qb.SQLStatement}[] = [
            {
                name: 'insert_into',
                map: {
                    insert_into: 'table_name',
                    columns: ['first', 'second', 'third', 'updated_at'],
                    values: [
                        [
                            {ip: 'val1'},
                            {ip: 'val2'},
                            {ip: 'val3'},
                            {r: "(NOW() AT TIME ZONE 'UTC')"},
                        ],
                        [
                            {ip: 'val1.2'},
                            {ip: 'val2.2'},
                            {ip: 'val3.2'},
                            {r: "(NOW() AT TIME ZONE 'UTC')"},
                        ],
                    ],
                    on_conflict: ['first', 'second'],
                    do_update: [['=', 'val3', 'excluded.val3']],
                    do_nothing: null,
                    where: ['!=', 'excluded.third', {ip: 5}],
                },
                sql: {
                    text:
                        'INSERT INTO "table_name"' +
                        ' ("first", "second", "third", "updated_at")' +
                        ' VALUES' +
                        " ($1, $2, $3, (NOW() AT TIME ZONE 'UTC'))," +
                        " ($4, $5, $6, (NOW() AT TIME ZONE 'UTC'))" +
                        ' ON CONFLICT ("first", "second") DO UPDATE' +
                        ' SET "val3" = "excluded"."val3"' +
                        ' DO NOTHING' +
                        ' WHERE "excluded"."third" != $7',
                    values: [
                        'val1',
                        'val2',
                        'val3',
                        'val1.2',
                        'val2.2',
                        'val3.2',
                        5,
                    ],
                },
            },
            {
                name: 'update',
                map: {
                    update: ['table', 't'],
                    set: [
                        ['=', 'col1', {ip: 'val1'}],
                        ['=', 'col2', {ip: 'val2'}],
                    ],
                    from: [
                        {
                            select: ['t2.id', 't2.name'],
                            from: ['joined', 't2'],
                            where: ['=', 't2.id', {ip: 3}],
                            for_update: true,
                        },
                        't3',
                    ],
                    where: ['=', 't3.id', 't.id'],
                    returning: ['t3.id'],
                },
                sql: {
                    text:
                        'UPDATE "table" "t"' +
                        ' SET "col1" = $1, "col2" = $2' +
                        ' FROM (SELECT "t2"."id", "t2"."name" FROM "joined" "t2" WHERE "t2"."id" = $3 FOR UPDATE) "t3"' +
                        ' WHERE "t3"."id" = "t"."id"' +
                        ' RETURNING "t3"."id"',
                    values: ['val1', 'val2', 3],
                },
            },
            {
                name: 'select',
                map: {
                    select: [['%', 'count', 't.id']],
                    from: ['table', 't'],
                    join: [
                        ['INNER', ['table2', 't2'], ['=', 't2.id', 't.id']],
                        ['INNER', ['table3', 't3'], ['=', 't3.id', 't.id']],
                    ],
                    where: [
                        'and',
                        ['=', 't.col1', {r: 3}],
                        [
                            'or',
                            ['=', 't.col2', {ip: 5}],
                            ['=', 't.col3', {ip: 6}],
                        ],
                    ],
                    group_by: ['t.id'],
                    having: ['=', 't.id', {ip: 7}],
                    order_by: [['at.id', 'ASC', 'NULLS LAST']],
                    limit: 5,
                    offset: 3,
                },
                sql: {
                    text:
                        'SELECT COUNT("t"."id")' +
                        ' FROM "table" "t"' +
                        ' INNER JOIN "table2" "t2" ON "t2"."id" = "t"."id"' +
                        ' INNER JOIN "table3" "t3" ON "t3"."id" = "t"."id"' +
                        ' WHERE ("t"."col1" = 3 AND ("t"."col2" = $1 OR "t"."col3" = $2))' +
                        ' GROUP BY "t"."id"' +
                        ' HAVING "t"."id" = $3' +
                        ' ORDER BY "at"."id" ASC NULLS LAST' +
                        ' LIMIT 5' +
                        ' OFFSET 3',
                    values: [5, 6, 7],
                },
            },
            {
                name: 'select_distinct',
                map: {
                    select_distinct: {on: ['t.id'], exprs: [['%', 'count', 't.id']]},
                    from: ['table', 't'],
                },
                sql: {
                    text:
                        'SELECT DISTINCT ON ("t"."id") COUNT("t"."id")' +
                        ' FROM "table" "t"',
                    values: [],
                },
            },
            {
                name: 'multiple order bys',
                map: {
                    order_by: [
                        ['at.id', 'ASC', 'NULLS LAST'],
                        ['col2', 'DESC', 'NULLS FIRST'],
                    ],
                },
                sql: {
                    text:
                        'ORDER BY "at"."id" ASC NULLS LAST, "col2" DESC NULLS FIRST',
                    values: [],
                },
            },
            {
                name: 'exprs',
                map: {
                    select: [
                        ['null', 't.id'],
                        ['not_null', 't.id'],
                        ['=', 't.code', {ip: null}],
                        ['=', 't.code', {r: null}],
                        [
                            'case_when',
                            ['=', 't.code', {ip: 'blue'}],
                            ['=', {r: 1}, {r: 1}],
                            ['=', {r: 1}, {r: 0}],
                        ],
                        ['in', 't.code', {ip: 'red'}, {ip: 'green'}],
                        ['in', 't.code', {ip: 'red'}],
                        ['in', 't.code', {select: ['t2.code']}],
                        {select: ['id'], from: 'table'},
                        ['as', 'col1', 'renamed'],
                        ['%', 'concat', {select: [{r: "'val'"}]}],
                        ['%', 'concat', 't.col1', 't2.col1'],
                        ['>', 't1.c', 't2.c'],
                        ['>=', 't1.c', 't2.c'],
                        ['<', 't1.c', 't2.c'],
                        ['<=', 't1.c', 't2.c'],
                        ['like', 't1.c', {ip: '%text%'}],
                        ['ilike', 't1.c', {ip: '%text%'}],
                        ['not_in', 't.code', {ip: 'red'}],
                        ['&&', 't1.c', 't2.c'],
                        ['not', 't1.b']
                    ],
                },
                sql: {
                    text:
                        'SELECT' +
                        ' "t"."id" IS NULL,' +
                        ' "t"."id" IS NOT NULL,' +
                        ' "t"."code" = $1,' +
                        ' "t"."code" = null,' +
                        ' CASE WHEN "t"."code" = $2 THEN 1 = 1 ELSE 1 = 0 END,' +
                        ' "t"."code" IN($3, $4),' +
                        ' "t"."code" IN($5),' +
                        ' "t"."code" IN(SELECT "t2"."code"),' +
                        ' (SELECT "id" FROM "table"),' +
                        ' "col1" as "renamed",' +
                        " CONCAT((SELECT 'val'))," +
                        ' CONCAT("t"."col1", "t2"."col1"),' +
                        ' "t1"."c" > "t2"."c",' +
                        ' "t1"."c" >= "t2"."c",' +
                        ' "t1"."c" < "t2"."c",' +
                        ' "t1"."c" <= "t2"."c",' +
                        ` "t1"."c" LIKE $6,` +
                        ` "t1"."c" ILIKE $7,` +
                        ` "t"."code" NOT IN($8),` +
                        ` "t1"."c" && "t2"."c",` +
                        ` NOT ("t1"."b")`,
                    values: [
                        null,
                        'blue',
                        'red',
                        'green',
                        'red',
                        '%text%',
                        '%text%',
                        'red'
                    ],
                },
            },
        ];

        tests.forEach((test) => {
            it(test.name, () =>
                expect(r.pick(['text', 'values'], qb.toSql(test.map))).eqls(
                    test.sql
                )
            );
        });
    });
});
