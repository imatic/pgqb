# pgqb

This library allows you to create dynamic sql queries.

In case of simple queries, you could just use [template literals][template_literals]:
```javascript
const sql = `
SELECT *
FROM "table"
`
```

In case you have lots of parameters, you could use [sql-template-strings][sql_template_strings]:
```javascript
import {SQL} from 'sql-template-strings';

const sqlStatement = `
INSERT INTO "table"
    ("col1", "col2")
VALUES
    (${val1}, ${val2})
`;
```

But what if you want to create queries dynamically? Splitting queries into several string parts, modifying several parts separately and then concatenating them togheter? There is better way - building queries as javascript data structures, which can be then easilly manipulated, merged, ...

Let's see previous query built using this library:
```javascript
import * as qb from 'pgqb';

const sqlMap = qb.merge(
    qb.insertInto('table'),
    qb.columns(['col1', 'col2']),
    qb.values([
        [
            qb.val.inlineParam(val1),
            qb.val.inlineParam(val2),
        ]
    ])
);

const sqlStatement = qb.toSql(sqlMap);
```

Query above automatically escapes identifiers (tables, colums). For now, building the query using this library seems more verbose than using just [sql-template-strings][sql_template_strings]. Imagine you would want to modify the query though. If you wanted to add additional column, you could do it like so:
```javascript
import * as qb from 'pgqb';

const sqlMap = qb.merge(
    qb.insertInto('table'),
    qb.columns(['col1', 'col2']),
    qb.values([
        [
            qb.val.inlineParam(val1),
            qb.val.inlineParam(val2),
        ]
    ])
);

const additionalColumn = qb.merge(
    qb.columns(['col3']),
    qb.values([
        [
            qb.val.inlineParam(val3),
        ]
    ])
)

const sqlStatement = qb.toSql(qb.append(sqlMap, additionalColumn));
```

Your query now inserts 3 columns instead of original 2. You can append other clauses (like `where`) too.

## Inspiraton

This library was inspired by [honeysql][honeysql].

[template_literals]: https://developer.mozilla.org/cs/docs/Web/JavaScript/Reference/Template_literals
[sql_template_strings]: https://www.npmjs.com/package/sql-template-strings
[honeysql]: https://github.com/jkk/honeysql
