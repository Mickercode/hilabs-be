import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'hilabs:public';

/**
 * Opens a route to anyone. Everything is closed by default: SessionGuard runs globally, so a new
 * endpoint is protected unless someone deliberately opts it out.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
