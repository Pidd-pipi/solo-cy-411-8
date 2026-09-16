import winston from 'winston';
import { appConfig } from '../config/app';
import { LogTemplates } from '../constants/logTemplates';

type TemplateValues = Record<string, string | number | undefined | null>;

function interpolate(template: string, values: TemplateValues = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? '-'));
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || appConfig.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)
  ),
  transports: [new winston.transports.Console()]
});

export function logTemplate(level: 'info' | 'warn' | 'error', key: keyof typeof LogTemplates, values?: TemplateValues) {
  logger[level](interpolate(LogTemplates[key], values));
}

