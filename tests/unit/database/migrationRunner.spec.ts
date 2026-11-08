import { splitStatements } from '../../../src/database/MigrationRunner';

describe('splitStatements', () => {
  it('splits a file into trimmed statements', () => {
    const statements = splitStatements(`
      CREATE TABLE a (id INT);
      CREATE TABLE b (id INT);
    `);

    expect(statements).toEqual(['CREATE TABLE a (id INT)', 'CREATE TABLE b (id INT)']);
  });

  it('drops comment lines, including ones containing semicolons', () => {
    const statements = splitStatements(`
      -- first table; second clause
      CREATE TABLE a (id INT);
      -- trailing comment;
    `);

    expect(statements).toEqual(['CREATE TABLE a (id INT)']);
  });

  it('keeps multi-line statements intact', () => {
    const statements = splitStatements(`
      CREATE TABLE a (
        id INT,
        name VARCHAR(10)
      );
    `);

    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('name VARCHAR(10)');
  });

  it('ignores a trailing semicolon and blank input', () => {
    expect(splitStatements('SELECT 1;')).toEqual(['SELECT 1']);
    expect(splitStatements('   \n\n  ')).toEqual([]);
    expect(splitStatements('-- only a comment')).toEqual([]);
  });
});
