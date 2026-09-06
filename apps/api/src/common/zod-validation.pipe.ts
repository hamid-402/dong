import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
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
