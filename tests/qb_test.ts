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
                    where: [
                        'and',
                        ['=', 't.col1', {r: 3}],
                        [
                            'or',
                            ['=', 't.col2', {ip: 5}],
                            ['=', 't.col3', {ip: 6}],
                        ],
                    ],
                },
                sql: {
                    text:
                        'SELECT COUNT("t"."id")' +
                        ' FROM "table" "t"' +
                        ' WHERE ("t"."col1" = 3 AND ("t"."col2" = $1 OR "t"."col3" = $2))',
                    values: [5, 6],
                },
            },
            {
                name: 'exprs',
                map: {
                    select: [
                        ['null', 't.id'],
                        ['=', 't.code', {ip: null}],
                        ['=', 't.code', {r: null}],
                        [
                            'case_when',
                            ['=', 't.code', {ip: 'blue'}],
                            ['=', {r: 1}, {r: 1}],
                            ['=', {r: 1}, {r: 0}],
                        ],
                        ['in', 't.code', {ip: 'red'}, {ip: 'green'}],
                        {select: ['id'], from: 'table'},
                        ['as', 'col1', 'renamed'],
                        ['%', 'concat', {select: [{r: "'val'"}]}],
                        ['%', 'concat', 't.col1', 't2.col1'],
                    ],
                },
                sql: {
                    text:
                        'SELECT' +
                        ' "t"."id" IS NULL,' +
                        ' "t"."code" = $1,' +
                        ' "t"."code" = null,' +
                        ' CASE WHEN "t"."code" = $2 THEN 1 = 1 ELSE 1 = 0 END,' +
                        ' "t"."code" IN($3, $4),' +
                        ' (SELECT "id" FROM "table"),' +
                        ' "col1" as "renamed",' +
                        " CONCAT((SELECT 'val'))," +
                        ' CONCAT("t"."col1", "t2"."col1")',
                    values: [null, 'blue', 'red', 'green'],
                },
            },
        ];

        tests.forEach(test => {
            it(test.name, () =>
                expect(r.pick(['text', 'values'], qb.toSql(test.map))).eqls(
                    test.sql
                )
            );
        });
    });
});