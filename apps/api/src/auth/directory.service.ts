import { readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { Client, InvalidCredentialsError } from 'ldapts';
import { readConfig } from '../config.js';
import { PASSWORD_MAX_LENGTH } from './password.js';

/** The directory could not be reached or answered with something other than "wrong password". */
export class DirectoryUnavailableError extends Error {}

/** The two things the sign-in needs from a directory client; a real one comes from `ldapts`. */
export interface DirectoryClient {
  startTLS?(): Promise<void>;
  bind(dn: string, password: string): Promise<void>;
  unbind(): Promise<void>;
}

/** The login names a directory account may have. The same pattern is enforced when the account is created. */
export const DIRECTORY_USERNAME = /^[a-z0-9][a-z0-9._-]{2,49}$/;

/** Builds the person's DN from the template. Only a name that is safe in a DN is ever put into it. */
export function buildBindDn(template: string, subject: string): string {
  if (!DIRECTORY_USERNAME.test(subject)) {
    throw new DirectoryUnavailableError('The stored directory name is not valid.');
  }

  return template.replaceAll('{username}', subject);
}

/**
 * Signs a person in against the hospital's directory by binding as them. Off unless `DIRECTORY_URL` is set.
 * It never reads or stores the password beyond the one bind, and never sends it unencrypted.
 */
@Injectable()
export class DirectoryService {
  get enabled(): boolean {
    return readConfig().directory !== undefined;
  }

  /** True when the directory accepts the password, false when it rejects it. Throws when it cannot say. */
  async authenticate(subject: string, password: string): Promise<boolean> {
    const settings = readConfig().directory;
    if (!settings) throw new DirectoryUnavailableError('Directory sign-in is not set up.');
    // A bind with an empty password is an anonymous bind, which many directories accept. Never allow it.
    if (password.length < 1 || password.length > PASSWORD_MAX_LENGTH) return false;

    const dn = buildBindDn(settings.bindDn, subject);
    const client = this.createClient(settings);
    try {
      if (settings.startTls) await client.startTLS?.();
      await client.bind(dn, password);

      return true;
    } catch (error) {
      if (error instanceof InvalidCredentialsError) return false;
      // The reason may name the server or the DN, so it is logged for the administrator and not shown.
      console.error(
        'Directory sign-in failed to reach a decision:',
        error instanceof Error ? error.message : error,
      );
      throw new DirectoryUnavailableError('The directory did not answer.');
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  protected createClient(
    settings: NonNullable<ReturnType<typeof readConfig>['directory']>,
  ): DirectoryClient {
    const tlsOptions = {
      ...(settings.caFile ? { ca: readFileSync(settings.caFile) } : {}),
      rejectUnauthorized: true,
    };
    const client = new Client({
      url: settings.url,
      timeout: settings.timeoutMs,
      connectTimeout: settings.timeoutMs,
      tlsOptions,
    });

    return {
      startTLS: () => client.startTLS(tlsOptions),
      bind: (dn, password) => client.bind(dn, password),
      unbind: () => client.unbind(),
    };
  }
}
