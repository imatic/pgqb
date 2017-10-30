import {expect} from 'chai';
import * as h from '../src/helper';

describe('qb/helper', () => {
    describe('merge', () => {
        const tests = [
            {
                name: 'insert_into',
                actual: h.merge(
                    h.insertInto('table_name'),
                    h.columns(['first', 'second', 'third', 'updated_at']),
                    h.values([
                        [
                            h.val.inlineParam('val1'),
                            h.val.inlineParam('val2'),
                            h.val.inlineParam('val3'),
                            h.val.raw("(NOW() AT TIME ZONE 'UTC')"),
                        ],
                        [
                            h.val.inlineParam('val1.2'),
                            h.val.inlineParam('val2.2'),
                            h.val.inlineParam('val3.2'),
                            h.val.raw("(NOW() AT TIME ZONE 'UTC')"),
                        ],
                    ]),
                    h.onConflict(['first', 'second']),
                    h.doUpdate([h.expr.eq('val3', 'excluded.val3')]),
                    h.where(h.expr.neq('excluded.third', h.val.inlineParam(5)))
                ),
                expected: {
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
            },
            {
                name: 'update',
                actual: h.merge(
                    h.update('table', 't'),
                    h.set([
                        h.expr.eq('col1', h.val.inlineParam('val1')),
                        h.expr.eq('col2', h.val.inlineParam('val2')),
                    ]),
                    h.from(
                        h.merge(
                            h.select(['t2.id', 't2.name']),
                            h.from('joined', 't2'),
                            h.where(h.expr.eq('t2.id', h.val.inlineParam(3))),
                            h.forUpdate()
                        ),
                        't3'
                    ),
                    h.where(h.expr.eq('t3.id', 't.id')),
                    h.returning(['t3.id'])
                ),
                expected: {
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
            },
            {
                name: 'select',
                actual: h.merge(
                    h.select([h.expr.fn('count', 't.id')]),
                    h.from('table', 't'),
                    h.joins(
                        h.join('table2', 't2', h.expr.eq('t2.id', 't.id')),
                        h.join('table3', 't3', h.expr.eq('t3.id', 't.id'))
                    ),
                    h.where(
                        h.expr.and(
                            h.expr.eq('t.col1', h.val.raw(3)),
                            h.expr.or(
                                h.expr.eq('t.col2', h.val.inlineParam(5)),
                                h.expr.eq('t.col3', h.val.inlineParam(6))
                            )
                        )
                    ),
                    h.orderBy('at.id')
                ),
                expected: {
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
                    order_by: [['at.id', 'ASC', 'NULLS LAST']],
                },
            },
            {
                name: 'exprs',
                actual: h.merge(
                    h.select([
                        h.expr.null('t.id'),
                        h.expr.eq('t.code', h.val.inlineParam(null)),
                        h.expr.eq('t.code', h.val.raw(null)),
                        h.expr.caseWhen(
                            h.expr.eq('t.code', h.val.inlineParam('blue')),
                            h.expr.eq(h.val.raw(1), h.val.raw(1)),
                            h.expr.eq(h.val.raw(1), h.val.raw(0))
                        ),
                        h.expr.in('t.code', [
                            h.val.inlineParam('red'),
                            h.val.inlineParam('green'),
                        ]),
                        h.expr.in('t.code', [h.val.inlineParam('red')]),
                        h.expr.in('t.code', h.select(['t2.code'])),
                        h.merge(h.select(['id']), h.from('table')),
                        h.expr.as('col1', 'renamed'),
                        h.expr.fn('concat', h.select([h.val.raw("'val'")])),
                        h.expr.fn('concat', 't.col1', 't2.col1'),
                        h.expr.gt('t1.c', 't2.c'),
                        h.expr.gte('t1.c', 't2.c'),
                        h.expr.lt('t1.c', 't2.c'),
                        h.expr.lte('t1.c', 't2.c'),
                    ])
                ),
                expected: {
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
                    ],
                },
            },
        ];

        tests.forEach(test => {
            it(test.name, () => expect(test.actual).eqls(test.expected));
        });
    });

    describe('append', () => {
        const tests = [
            {
                name: '2 maps',
                actual: h.append(
                    h.merge(
                        h.columns(['col1', 'col2']),
                        h.values([['v1', 'v2'], ['v1.2', 'v2.2']]),
                        h.where(h.expr.eq('col1', 'col2')),
                        h.set([h.expr.eq('col1', 'col2')])
                    ),
                    h.merge(
                        h.columns(['col3']),
                        h.values([['v3'], ['v3.2']]),
                        h.where(h.expr.eq('col3', 'col4')),
                        h.set([h.expr.eq('col3', 'col4')])
                    )
                ),
                expected: {
                    columns: ['col1', 'col2', 'col3'],
                    values: [['v1', 'v2', 'v3'], ['v1.2', 'v2.2', 'v3.2']],
                    where: [
                        'and',
                        ['=', 'col1', 'col2'],
                        ['=', 'col3', 'col4'],
                    ],
                    set: [['=', 'col1', 'col2'], ['=', 'col3', 'col4']],
                },
            },
            {
                name: '2 maps where first is empty',
                actual: h.append(
                    {},
                    h.merge(h.columns(['col3']), h.values([['v3'], ['v3.2']]))
                ),
                expected: {
                    columns: ['col3'],
                    values: [['v3'], ['v3.2']],
                },
            },
            {
                name: '2 maps where second is empty',
                actual: h.append(
                    h.merge(
                        h.columns(['col1', 'col2']),
                        h.values([['v1', 'v2'], ['v1.2', 'v2.2']])
                    ),
                    {}
                ),
                expected: {
                    columns: ['col1', 'col2'],
                    values: [['v1', 'v2'], ['v1.2', 'v2.2']],
                },
            },
        ];

        tests.forEach(test => {
            it(test.name, () => expect(test.actual).eqls(test.expected));
        });
    });
});
