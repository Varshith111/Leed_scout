import {
  findErrorCode,
  isObjectExistsError,
  isTransientDatabaseError,
} from '../../../src/database/DatabaseService';
import { DatabaseError } from '../../../src/utils/errors';

describe('findErrorCode', () => {
  it('reads the code from a driver error', () => {
    expect(findErrorCode({ code: 'ER_DUP_KEYNAME' })).toBe('ER_DUP_KEYNAME');
  });

  it('follows the cause chain of a wrapped error', () => {
    const wrapped = new DatabaseError('DDL statement failed', {}, { code: 'ER_DUP_KEYNAME' });

    expect(findErrorCode(wrapped)).toBe('ER_DUP_KEYNAME');
  });

  it('returns undefined for plain errors and non-objects', () => {
    expect(findErrorCode(new Error('boom'))).toBeUndefined();
    expect(findErrorCode('boom')).toBeUndefined();
    expect(findErrorCode(null)).toBeUndefined();
  });
});

describe('isTransientDatabaseError', () => {
  it.each(['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'])(
    'retries %s',
    (code) => {
      expect(isTransientDatabaseError({ code })).toBe(true);
    },
  );

  it.each(['ER_NO_SUCH_TABLE', 'ER_DUP_ENTRY', 'ER_PARSE_ERROR'])('does not retry %s', (code) => {
    expect(isTransientDatabaseError({ code })).toBe(false);
  });
});

describe('isObjectExistsError', () => {
  it.each(['ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME', 'ER_FK_DUP_NAME', 'ER_DUP_FIELDNAME'])(
    'treats %s as already satisfied',
    (code) => {
      expect(isObjectExistsError({ code })).toBe(true);
    },
  );

  it('sees through a wrapped DatabaseError', () => {
    const wrapped = new DatabaseError('DDL statement failed', {}, { code: 'ER_DUP_KEYNAME' });

    expect(isObjectExistsError(wrapped)).toBe(true);
  });

  it('does not swallow genuine failures', () => {
    expect(isObjectExistsError({ code: 'ER_PARSE_ERROR' })).toBe(false);
    expect(isObjectExistsError({ code: 'ER_NO_REFERENCED_ROW_2' })).toBe(false);
  });
});
