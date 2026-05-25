import { describe, it, expect } from 'vitest';
import { SITS_ENTITY_QUERIES } from '../entity-queries';

describe('SITS_ENTITY_QUERIES', () => {
  const expectedEntities = [
    'Student',
    'CourseInstance',
    'StudentCourseJoin',
    'Module',
    'ModuleInstance',
    'StudentModuleResult',
    'Address',
    'Qualification',
  ];

  it('defines queries for all expected entities', () => {
    for (const entity of expectedEntities) {
      expect(SITS_ENTITY_QUERIES).toHaveProperty(entity);
    }
  });

  it('every query is a non-empty string', () => {
    for (const [entity, sql] of Object.entries(SITS_ENTITY_QUERIES)) {
      expect(typeof sql).toBe('string');
      expect(sql.trim().length).toBeGreaterThan(20);
    }
  });

  it('Student query selects HUSID', () => {
    expect(SITS_ENTITY_QUERIES['Student']).toContain('HUSID');
  });

  it('StudentCourseJoin query selects MODE and RSNEND', () => {
    expect(SITS_ENTITY_QUERIES['StudentCourseJoin']).toContain('MODE');
    expect(SITS_ENTITY_QUERIES['StudentCourseJoin']).toContain('RSNEND');
  });

  it('no query contains a DROP, UPDATE or DELETE statement', () => {
    for (const [entity, sql] of Object.entries(SITS_ENTITY_QUERIES)) {
      const upper = sql.toUpperCase();
      expect(upper, `${entity} query should be read-only`).not.toMatch(
        /\b(DROP|UPDATE|DELETE|INSERT|TRUNCATE|ALTER)\b/,
      );
    }
  });
});
