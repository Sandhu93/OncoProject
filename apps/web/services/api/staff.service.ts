import 'server-only';

import { CLINICAL_ROLES, STAFF_CAPABILITIES, type StaffProfile } from '@oncotrack/contracts';
import { z } from 'zod';

import { handleRequest } from './base.service';

/** The API's `GET /auth/me` response; the shape is defined once in `@oncotrack/contracts`. */
const StaffProfileSchema = z.object({
  id: z.string(),
  username: z.string(),
  fullName: z.string(),
  roles: z.array(z.enum(CLINICAL_ROLES)),
  capabilities: z.array(z.enum(STAFF_CAPABILITIES)),
});

export default class StaffService {
  /** The signed-in staff member. A rejected token ends the session and sends the user to login. */
  static me = () =>
    handleRequest<StaffProfile>('/auth/me', {
      requiresAuth: true,
      parse: data => StaffProfileSchema.parse(data),
    });
}
