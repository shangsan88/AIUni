import { createLogger } from './logger';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('logger utilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_FORMAT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats log output correctly (default format)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const logger = createLogger('test');
    logger.info('hello');

    expect(spy).toHaveBeenCalledTimes(1);

    const output = spy.mock.calls[0][0];

    expect(output).toContain('[INFO]');
    expect(output).toContain('[test]');
    expect(output).toContain('hello');
  });

  it('respects log level filtering', () => {
    process.env.LOG_LEVEL = 'warn';

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const logger = createLogger('test');

    logger.info('should not log');
    logger.warn('should log');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('outputs JSON format when LOG_FORMAT=json', () => {
    process.env.LOG_FORMAT = 'json';

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const logger = createLogger('test');
    logger.info('hello');

    const output = spy.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed).toHaveProperty('timestamp');
    expect(parsed.level).toBe('INFO');
    expect(parsed.tag).toBe('test');
    expect(parsed.message).toContain('hello');
  });

  it('formats Error objects correctly', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const logger = createLogger('test');
    const error = new Error('boom');

    logger.error(error);

    const output = spy.mock.calls[0][0];

    expect(output).toContain('boom');
  });
});
