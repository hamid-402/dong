import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { ProblemDetails } from "@dang/contracts";
import { createLogger } from "@dang/observability";

const logger = createLogger("dang-api");

type HttpRequestLike = {
  url?: string;
  headers: Record<string, string | string[] | undefined>;
};

type HttpResponseLike = {
  status: (code: number) => HttpResponseLike;
  header: (name: string, value: string) => HttpResponseLike;
  send: (payload: ProblemDetails) => unknown;
};

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<HttpResponseLike>();
    const request = context.getRequest<HttpRequestLike>();
    const requestId = headerValue(request.headers, "x-request-id");

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = "Internal Server Error";
    let detail: string | undefined;
    let type = "https://dang.local/problems/internal";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        title = body;
        detail = body;
      } else if (typeof body === "object" && body !== null) {
        const record = body as Record<string, unknown>;
        title =
          typeof record.title === "string"
            ? record.title
            : typeof record.message === "string"
              ? record.message
              : exception.message;
        detail =
          typeof record.detail === "string"
            ? record.detail
            : Array.isArray(record.message)
              ? record.message.map(String).join(", ")
              : typeof record.message === "string"
                ? record.message
                : undefined;
        type =
          typeof record.type === "string"
            ? record.type
            : `https://dang.local/problems/http-${status}`;
      }
    } else if (exception instanceof Error) {
      const isProduction = process.env.NODE_ENV === "production";
      detail = isProduction
        ? "An unexpected error occurred"
        : exception.message;
      logger.error("Unhandled exception", {
        detail: exception.message,
        path: request.url ?? "",
      });
    }

    const problem: ProblemDetails = {
      type,
      title,
      status,
      detail,
      instance: request.url,
      requestId,
    };

    response
      .status(status)
      .header("content-type", "application/problem+json; charset=utf-8")
      .send(problem);
  }
}
