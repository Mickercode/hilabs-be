import { plainToInstance, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  // Environment variables arrive as strings. enableImplicitConversion cannot infer the target
  // type from an initialiser alone, so the transform is explicit.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  @IsOptional()
  WEB_ORIGIN = 'http://localhost:3001';

  @IsString()
  @IsOptional()
  ANTHROPIC_API_KEY = '';
}

/**
 * Fails the process at boot rather than at the first request. A misconfigured API that starts
 * and then writes nowhere is worse than one that refuses to start.
 */
export function validateEnv(config: Record<string, unknown>) {
  const parsed = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(parsed, { skipMissingProperties: false });
  if (errors.length > 0) {
    const detail = errors
      .map((e) => `  ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${detail}`);
  }

  return parsed;
}
