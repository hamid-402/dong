import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  formatTraceparent,
  getSpanId,
  getTraceId,
  newSpanId,
  parseTraceparent,
  resolveTracingMode,
  runWithRequestContext,
  withSpan,
} from "@dang/observability";
import { Observable, lastValueFrom } from "rxjs";

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
};

type ReplyLike = {
  header?: (name: string, value: string) => void;
  setHeader?: (name: string, value: string) => void;
};

function headerValue(
  headers: RequestLike["headers"],
  name: string,
): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestLike>();
    const reply = http.getResponse<ReplyLike>();

    const fromHdr = headerValue(request.headers, "x-request-id");
    const requestId = fromHdr && fromHdr.length > 0 ? fromHdr : randomUUID();
    request.headers["x-request-id"] = requestId;

    const traced = parseTraceparent(headerValue(request.headers, "traceparent"));
    const tracingOff = resolveTracingMode() === "off";

    const setHeader = (name: string, value: string) => {
      if (typeof reply.header === "function") reply.header(name, value);
      else if (typeof reply.setHeader === "function") reply.setHeader(name, value);
    };
    setHeader("x-request-id", requestId);

    return new Observable((subscriber) => {
      runWithRequestContext({ requestId, traceId: traced?.traceId }, () => {
        void (async () => {
          try {
            const exec = async (): Promise<unknown> => {
              if (!tracingOff) {
                const spanId = getSpanId() ?? newSpanId();
                const tid = getTraceId();
                if (tid) setHeader("traceparent", formatTraceparent(tid, spanId));
              }
              return (await lastValueFrom(next.handle(), {
                defaultValue: undefined,
              })) as unknown;
            };
            const value: unknown = tracingOff
              ? await exec()
              : await withSpan("http.request", { requestId }, exec);
            // Always emit once — Nest's router uses lastValueFrom without defaultValue;
            // empty completion throws EmptyError ("no elements in sequence") on SSE/@Res handlers.
            subscriber.next(value);
            subscriber.complete();
          } catch (err) {
            subscriber.error(err);
          }
        })();
      });
    });
  }
}
