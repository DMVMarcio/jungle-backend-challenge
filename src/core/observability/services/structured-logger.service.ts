import { Injectable, LoggerService, Optional } from '@nestjs/common';

import { RequestContextService } from './request-context.service';

@Injectable()
export class StructuredLogger implements LoggerService {
	private static readonly SENSITIVE_KEYS = new Set([
		'authorization',
		'token',
		'password',
		'secret',
		'body',
		'data',
		'money',
		'payload'
	]);

	constructor(
		@Optional()
		private readonly requestContextService?: RequestContextService
	) {}

	log(message: string, ...optionalParams: unknown[]): void {
		this.write('INFO', message, optionalParams);
	}

	info(message: string, ...optionalParams: unknown[]): void {
		this.write('INFO', message, optionalParams);
	}

	warn(message: string, ...optionalParams: unknown[]): void {
		this.write('WARN', message, optionalParams);
	}

	error(message: string, ...optionalParams: unknown[]): void {
		this.write('ERROR', message, optionalParams);
	}

	debug(message: string, ...optionalParams: unknown[]): void {
		this.write('DEBUG', message, optionalParams);
	}

	private write(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, optionalParams: unknown[]): void {
		const { contextStr, contextObj } = this.parseOptionalParams(level, optionalParams);
		const store = this.requestContextService?.getStore();

		const entry: Record<string, unknown> = {
			timestamp: new Date().toISOString(),
			level,
			context: (contextObj.context as string | undefined) ?? contextStr ?? 'Application',
			message,
			correlationId: contextObj.correlationId ?? store?.correlationId,
			messageId: contextObj.messageId ?? store?.messageId,
			transactionId: contextObj.transactionId ?? store?.transactionId,
			walletId: contextObj.walletId ?? store?.walletId,
			providerId: contextObj.providerId ?? store?.providerId
		};

		if (contextObj.durationMs !== undefined) entry.durationMs = contextObj.durationMs;
		if (contextObj.statusCode !== undefined) entry.statusCode = contextObj.statusCode;
		if (contextObj.method !== undefined) entry.method = contextObj.method;
		if (contextObj.url !== undefined) entry.url = contextObj.url;
		if (contextObj.trace !== undefined) entry.trace = contextObj.trace;

		this.appendSanitizedFields(entry, contextObj);

		const serialized = JSON.stringify(entry);
		if (level === 'ERROR') {
			console.error(serialized);
		} else {
			console.log(serialized);
		}
	}

	private parseOptionalParams(
		level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG',
		optionalParams: unknown[]
	): { contextStr?: string; contextObj: Record<string, unknown> } {
		let contextStr: string | undefined;
		let contextObj: Record<string, unknown> = {};

		if (level === 'ERROR') {
			const stringParams: string[] = [];
			for (const param of optionalParams) {
				if (typeof param === 'string') {
					stringParams.push(param);
				} else if (typeof param === 'object' && param !== null) {
					contextObj = { ...contextObj, ...(param as Record<string, unknown>) };
				}
			}
			if (stringParams.length === 1) {
				contextObj.trace = stringParams[0];
			} else if (stringParams.length >= 2) {
				contextObj.trace = stringParams[0];
				contextStr = stringParams[1];
			}
		} else {
			for (const param of optionalParams) {
				if (typeof param === 'string') {
					contextStr = param;
				} else if (typeof param === 'object' && param !== null) {
					contextObj = { ...contextObj, ...(param as Record<string, unknown>) };
				}
			}
		}

		return { contextStr, contextObj };
	}

	private appendSanitizedFields(entry: Record<string, unknown>, contextObj: Record<string, unknown>): void {
		for (const [key, value] of Object.entries(contextObj)) {
			if (key in entry || StructuredLogger.SENSITIVE_KEYS.has(key.toLowerCase()) || value === undefined) {
				continue;
			}
			entry[key] = value;
		}
	}
}
