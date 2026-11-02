import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { uuidSchema } from "@dang/contracts";

/**
 * Validates a path param as a UUID using contracts uuidSchema.
 * Error shape matches ZodValidationPipe (400 problem+json).
 */
export class UuidParamPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    const result = uuidSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid request payload",
        status: 400,
        errors: result.error.flatten(),
      });
    }
    return result.data;
  }
}
