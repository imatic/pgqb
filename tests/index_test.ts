import {expect} from 'chai';
import * as qb from '../src/index';

describe('index', () => {
    it('function from qb module should be exported', () => {
        expect(typeof qb.toSql).equal('function');
    });

    it('function from helper module should be exported', () => {
        expect(typeof qb.select).equal('function');
    });
});
